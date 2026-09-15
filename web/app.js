import {installMotionLayout} from './motion-layout.js';
import {secondaryKind,normalizeSecondary} from './secondary-motion.js';
import {installSecondaryMotion} from './secondary-motion-ui.js';
import {exportProgress} from './export-progress.js';
import {streamLoopMp4} from './loop-export.js';
import {naturalMotionSettings,sampleMotionSettings} from './natural-motion.js';
import {normalizeArtworkSources,installArtworkSources} from './artwork-sources.js';
import {earEnabled,chooseEarLayer,earLayerSelection} from './idle-expression.js';
import {activateMotionControl} from './hair-activation.js';
import {installPivotPicker} from './pivot-picker.js';
import {chestRegion} from './chest-motion.js';
import {SpeechEnvelope} from './speech-envelope.js';
import {installLayerSort,reorderLayers} from './layer-sort.js';
import {foregroundHairIds} from './eye-through-hair.js';
import {installTtsUI} from './tts-ui.js';
import {browserSpeech} from './browser-speech.js';
import {installRigEditor} from './rig-editor.js';
import {installWorkspaceUI,updateSliderTracks} from './workspace-ui.js';
import {installImportFlow} from './import-flow.js';
import {editingPose,installWorkArea,EDIT_EYE_BLEND,EDIT_MOUTH_BLEND} from './work-area.js';
import {installStudioOutputs} from './studio-outputs.js';
import {motionValues} from './assist-motion.js';
import {installMotionAssistResult} from './motion-assist-result.js';
import {createAssistController} from './assist-controller.js';
import {installAssistPanel} from './assist-panel.js';
import {installAssistEntry} from './assist-entry.js';
import {installStartSample} from './start-sample.js';
import {installMainMenu,rememberCharacter,returnToMenu} from './main-menu.js';
import {installSaveGuard} from './save-guard.js';
import {installShapeAssist} from './shape-assist.js';
import {pngBlob,exportPlan} from './material-export.js';
import {installMouthEditor} from './mouth-editor.js';
import {normalizeMouthTuning} from './vowels.js';
import {normalizeLid} from './eyelid-controls.js';
import {normalizeStrands} from './hair-strands.js';
import {svgSignature} from './raster-source.js';
import {sanitizeSvg} from './assets.js';
import {prepareCanvasRenderer} from './canvas-renderer.js?v=mouth-editor-9';
import {normalizeRig,rigActive,frontHairEnd} from './rig.js?v=mouth-editor-9';
import {restrainedDefaults} from './pachipaku-motion.js?v=mouth-editor-9';
import {ensureSeamRig} from './seam-rig.js';
import {kanaTrack,timedVowel,vowels} from './vowels.js';
import {clamp, esc, loopPose, mouthEnvelope, sceneSvg, applyPose} from './motion.js?v=mouth-editor-9';

const $ = id => document.getElementById(id);
installMotionLayout();
const importFlow=installImportFlow();
const assistEntry=installAssistEntry();
let project = null, selected = null, svg = null, playing = false, time = 0, view = 'motion';
let lastTick = performance.now(), testBlinkUntil = 0, importing = false, recording = false;
let audioContext, analyser, mediaDestination, audioSource, audioUrl, lastWav, voiceMouth = 0, browserMouth = 0, speechActive = false;
let synthController = null, voiceGeneration = 0;
let previewRenderer=null, previewGeneration=0,rasterReady=Promise.resolve(),previewReady=Promise.resolve();
let pivotPicker,pivotWasPlaying=false,secondaryUI;
let editor,heldEye="",wasPlayingBeforeHold=false;
let mouthEditor,mouthPreview=null,artworkSources;
let manualVowel=null,voiceTokens=[],speechStarted=0;
let outputs=null,materialsWasPlaying=false,materialsRendering=false;
let workspaceUI=null;
let saveGuard=null,livePreview=false,savingProject=false;
let staticFrameKey='',resumeAfterEdit=false;
const inShapeEditor=()=>workspaceUI?.active==='edit';
const workArea=installWorkArea({enabled:()=>!!project&&['edit','motion','export'].includes(workspaceUI?.active)});
const ttsUI=installTtsUI({stop:stopVoice,status:voiceStatus,post:(...args)=>postJson(...args)});
const voiceEnvelope=new SpeechEnvelope(),browserEnvelope=new SpeechEnvelope();
const defaultSpeech=$('speechText').value,defaultReading='こんにちは。きょうは、どんなうごきをつくりましょうか。';
const roles = new Set(['tail','static','glasses','hair','chest','ear-r','ear-l','mouth','white-r','iris-r','lash-r','brow-r','white-l','iris-l','lash-l','brow-l']);
const rolesJa = {'tail':'尻尾','static':'固定','glasses':'眼鏡','hair':'髪','chest':'胸','ear-r':'右耳','ear-l':'左耳','mouth':'口','white-r':'右の白目','iris-r':'右の瞳','lash-r':'右のまつ毛','brow-r':'右の眉','white-l':'左の白目','iris-l':'左の瞳','lash-l':'左のまつ毛','brow-l':'左の眉'};
const parseSvg = text => new DOMParser().parseFromString(text, 'image/svg+xml').documentElement;


function status(text, error=false) {
  exportProgress.update(text);
  $('status').textContent = text;
  $('statusDot').style.background = error ? '#c47961' : '#78a079';
  $('sourceStatus').textContent=text;$('sourceStatus').hidden=false;$('sourceStatus').classList.toggle('error',error);
}
async function request(url, options={}) {
  const result = await fetch(url, options);
  if (!result.ok) {
    let msg;
    try { const body = await result.json(); msg = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail); } catch {msg = result.statusText;}
    throw Error(msg || `HTTP ${result.status}`);
  }
  return result;
}
const postJson = (url, body, signal) => request(url, {method:'POST', headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});
const safe = fn => async e => {try {await fn(e);} catch(err) {if(err.name !== 'AbortError') status(err.message, true);}};
const exportTask=(label,fn)=>safe(()=>exportProgress.run(label,fn,()=>{const link=$('lastExport');return link.hidden?null:{url:link.href,name:link.textContent,path:link.title};}));
function needProject() {if (!project) throw Error('先にPSDまたは画像を読み込んでください');if(project.rig?.seamPending)throw Error('パーツの境界を準備しています。少し待ってください');}
function settings() {
  return {depthEnabled:!!project?.rig?.depth&&$('depthEnabled').checked,depthStrength:clamp($('depthStrength').value),tailSwing:+$('tailSwing').value,tailCycles:+$('tailCycles').value,irisGaze:$('irisGaze').value,earPattern:$('earPattern').value,earCycles:+$('earCycles').value,independentHair:true,frontHairMethod:$('frontHairMethod').value,backHairMethod:$('backHairMethod').value,frontHairCycles:+$('frontHairCycles').value,backHairCycles:+$('backHairCycles').value,irisX:+$('irisX').value,irisScale:+$('irisScale').value,irisCycles:+$('irisCycles').value,eyeThroughHair:$('eyeThroughHair').checked,eyeThroughHairStrength:clamp($('eyeThroughHairStrength').value),mouthTuning:project?.settings?.mouthTuning,headPitch:+$('headPitch').value,pitchSway:+$('pitchSway').value,renderSource:$('renderSource').value,mouthStyle:project?.settings?.mouthStyle==='anime'?'anime':'artwork',mouthOffsetY:clamp(project?.settings?.mouthOffsetY??0,-20,20),rigMode:$('rigMode').value,hairMethod:$('hairMethod').value,springCycles:+$('springCycles').value,springSoftness:.5,lipSyncMode:'open-close',vowels:false,frontHair:+$('frontHair').value,backHair:+$('backHair').value,hairTip:2,armSwing:+$('armSwing').value,rigEnabled:$('rigEnabled').checked,headTilt:+$('headTilt').value,headYaw:+$('headYaw').value,headNod:+$('headNod').value,bodyFollow:+$('bodyFollow').value,hairBend:+$('hairBend').value,
    bounceDuration:project?.settings?.bounceDuration,duration:clamp($('duration').value,1,30), sway:clamp($('sway').value,0,12), breathe:clamp($('breathe').value,0,40), blink:$('blink').checked, talking:$('talking').checked,
    singleBounce:$('singleBounce').checked,bounceHeight:clamp($('bounceHeight').value,0,160),hair:clamp($('hair').value,0,25),chest:clamp($('chest').value,0,40),ears:clamp($('ears').value,0,30),closedWidth:clamp(project?.settings?.closedWidth??.8,.5,1),background:$('outputBackground').value};
}
function updateSettings(event) {
  $('depthStrengthOut').value=Math.round(clamp($('depthStrength').value)*100)+'%';$('depthStrength').disabled=!$('depthEnabled').checked;
  updateSliderTracks();
  const s=settings(),motionActivated=!!project&&activateMotionControl(event?.target?.id,s);
  if(motionActivated){$('rigEnabled').checked=true;if(!project.rig)project.rig=normalizeRig({},project);}
  if(project) project.settings=s;
  $('eyeThroughHairStrengthOut').value=Math.round(s.eyeThroughHairStrength*100)+'%';$('eyeThroughHairStrength').disabled=!s.eyeThroughHair;
  for(const id of ['tailSwing','tailCycles','irisX','irisScale','irisCycles','headPitch','pitchSway','headTilt','headYaw','headNod','bodyFollow','hairBend','frontHair','backHair','frontHairCycles','backHairCycles','armSwing','springCycles'])$(id+'Out').value=s[id];
  for(const id of ['irisX'])$(id+'Out').value=s[id]+' px';
  $('irisScaleOut').value=s.irisScale+'%';
  $('pitchSwayOut').value=Math.round(s.pitchSway*100)+'%';
  for(const id of ['earCycles','irisCycles'])$(id+'Out').value=s[id]+'回';
  for(const id of ['springCycles','frontHairCycles','backHairCycles'])$(id+'Out').value=s[id]+'回 / ループ';
  mouthEditor?.refresh();
  $('duration').value=s.duration; $('swayOut').value=s.sway+'°'; $('breatheOut').value=s.breathe+' px';
  for(const id of ['bounceHeight','hair','chest','ears'])$(id+'Out').value=s[id]+(['hair','ears'].includes(id)?'°':' px');
  $('earsOut').value=s.earPattern==='natural'?s.ears:s.earPattern==='up'?s.ears*.5+' px':s.ears*.25+'°';
  $('earsAmountLabel').textContent=s.earPattern==='up'?'跳ねる高さ':'揺れの大きさ';
  $('earPivotPick').hidden=s.earPattern==='up';
  $('stage').classList.toggle('white',s.background==='white');
  $('scrubber').max=s.duration; $('durationLabel').textContent='/ '+s.duration.toFixed(2).padStart(5,'0')+' s'; $('endTime').textContent=s.duration+' s';
  if(time>s.duration) time=0;
  if(motionActivated)rebuild();
}
function setSettings(s) {
  $('depthControls').hidden=!project?.rig?.depth;$('depthEnabled').checked=!!project?.rig?.depth&&s.depthEnabled!==false;$('depthStrength').value=clamp(s.depthStrength??1);
  if(project)project.settings.bounceDuration=Number.isFinite(s.bounceDuration)?clamp(s.bounceDuration,1,30):undefined;
  $('eyeThroughHair').checked=s.eyeThroughHair===true;$('eyeThroughHairStrength').value=Number.isFinite(+s.eyeThroughHairStrength)?clamp(s.eyeThroughHairStrength):.35;
  const defaults={tailSwing:8,tailCycles:1,earCycles:1,irisX:0,irisScale:0,irisCycles:1,headPitch:0,pitchSway:0,duration:4,bounceHeight:28,hair:0,chest:0,ears:0,...restrainedDefaults};
  $('irisGaze').value=s.irisGaze==='sweep'?'sweep':'natural';
  $('earPattern').value=['twitch','double','alternate','droop','up','natural'].includes(s.earPattern)?s.earPattern:'twitch';
  $('rigMode').value='stable';
  $('rigMode').disabled=!!project?.rig?.segmented;
  if(project?.rig?.segmented)$('rigMode').value='stable';
  for(const id of Object.keys(defaults).filter(id=>!['rigMode','hairMethod','hairTip','springSoftness'].includes(id))) $(id).value=s[id] ?? defaults[id];
  $('hairMethod').value=s.hairMethod==='wave'?'wave':'spring';
  for(const prefix of ['front','back']){const method=s[prefix+'HairMethod']??s.hairMethod;$(prefix+'HairMethod').value=method==='wave'?'wave':'spring';$(prefix+'HairCycles').value=s[prefix+'HairCycles']??s.springCycles??1;if(method==='off')$(prefix+'Hair').value=0;}
  if(s.hairMethod==='off')$('hairBend').value=0;
  $('vowels').checked=false;
  $('renderSource').value=s.renderSource==='svg'?'svg':'original';
  $('rigEnabled').checked=!!s.rigEnabled;
  $('singleBounce').checked=!!s.singleBounce;$('outputBackground').value=s.background==='transparent'?'transparent':'white';
  $('blink').checked=s.blink ?? true; $('talking').checked=!!s.talking; updateSettings();
}

function validateProject(p) {
  if(!p || p.version!==1 || !Array.isArray(p.parts) || p.parts.length>100 || !p.parts.length) throw Error('対応するプロジェクトJSONではありません');
  if(!Number.isFinite(p.width) || !Number.isFinite(p.height) || p.width<=0 || p.height<=0 || p.width*p.height>16777216) throw Error('キャンバスサイズが不正です');
  p.name=String(p.name || 'Untitled').slice(0,150);
  p.parts=p.parts.map((part,i)=>{
    for(const key of ['x','y','width','height']) if(!Number.isFinite(part[key]) || Math.abs(part[key])>20000) throw Error('パーツ座標が不正です');
    if(part.width<=0 || part.height<=0) throw Error('パーツサイズが不正です');
    const clean={id:`p${String(i).padStart(3,'0')}`, name:String(part.name||`Part ${i}`).replace(/^(元画像の[左右]腕・袖)（試作）$/,'$1').slice(0,150), x:part.x,y:part.y,width:part.width,height:part.height,
      role:roles.has(part.role)?part.role:'static', visible:part.visible !== false, opacity:clamp(part.opacity ?? 1), paths:clamp(part.paths,0,1000000)};
    clean.mouthMode=['source-open','synthetic'].includes(part.mouthMode)?part.mouthMode:'source-closed';
    if(part.hairControl&&['rootY','tipY','centerX','radius'].every(k=>Number.isFinite(part.hairControl[k]))){const c=part.hairControl;clean.hairControl={rootY:clamp(c.rootY,0,p.height*.9),tipY:clamp(c.tipY,clamp(c.rootY,0,p.height*.9)+p.height*.1,p.height),centerX:clamp(c.centerX,0,p.width),radius:clamp(c.radius,p.width*.08,p.width*2)};}
    if(part.lidAdjust)clean.lidAdjust=normalizeLid(part.lidAdjust);
    for(const k of ['hairStrands','savedHairStrands'])if(part[k])clean[k]=normalizeStrands(part[k],p);
    if(part.faceBase===true)clean.faceBase=true;
    if(typeof part.earMotion==='boolean')clean.earMotion=part.earMotion;
    clean.motionStrength=clamp(part.motionStrength??1,0,2);
    if(['l','r'].includes(part.blinkOverlay))clean.blinkOverlay=part.blinkOverlay;
    if(/^brow-[lr]$/.test(part.faceOverlay||''))clean.faceOverlay=part.faceOverlay;
    if(['core','front','back','arm-r','arm-l','tail','bottomwear','neckwear','earwear','wings'].includes(part.deformGroup))clean.deformGroup=part.deformGroup;
    if(part.independentAccessory){clean.independentAccessory=true;clean.sourceLayerName=String(part.sourceLayerName||'').slice(0,150);}
    if(part.secondaryMotion)clean.secondaryMotion=normalizeSecondary(part.secondaryMotion);
    for(const key of ['pivotX','pivotY'])if(Number.isFinite(part[key]))clean[key]=clamp(part[key],-20000,20000);
    clean.svgText=sanitizeSvg(part.svgText,`s${i}-`);
    Object.assign(clean,normalizeArtworkSources({...part,id:clean.id},sanitizeSvg));
    if(Array.isArray(part.spatialBounds)&&part.spatialBounds.length<=100000&&part.spatialBounds.every(b=>Array.isArray(b)&&b.length===4&&b.every(Number.isFinite)))clean.spatialBounds=part.spatialBounds;
    for(const kind of ['openSvgText','closedSvgText']) if(part[kind]) clean[kind]=sanitizeSvg(part[kind],`d${i}-${kind}-`);
    if(part.closedSource==='psd')clean.closedSource='psd';
    if(part.mouthVariants&&clean.role==='mouth'){
      clean.mouthVariants={};for(const key of vowels)if(part.mouthVariants[key])clean.mouthVariants[key]=sanitizeSvg(part.mouthVariants[key],`variant${i}-${key}-`);
      if(!Object.keys(clean.mouthVariants).length)delete clean.mouthVariants;
    }
    if(part.mouthInteriorSvg)clean.mouthInteriorSvg=sanitizeSvg(part.mouthInteriorSvg,`inside${i}-`);
    if(typeof part.originalUrl==='string' && (/^\/assets\/[a-f0-9]{32}\/originals\/p\d+\.png$/.test(part.originalUrl) || /^data:image\/png;base64,[a-zA-Z0-9+/=]+$/.test(part.originalUrl))) clean.originalUrl=part.originalUrl;
    clean.rasterDisabled=!!part.rasterDisabled;
    if(typeof part.rasterSourceUrl==='string'&&(/^\/assets\/[a-f0-9]{32}\/originals\/p\d+\.png$/.test(part.rasterSourceUrl)||/^data:image\/png;base64,[a-zA-Z0-9+/=]+$/.test(part.rasterSourceUrl))&&/^[a-f0-9]{64}$/.test(part.rasterSignature||'')){clean.rasterSourceUrl=part.rasterSourceUrl;clean.rasterSignature=part.rasterSignature;}
    return clean;
  });
  if(!/^\/assets\/[a-f0-9]{32}\/source\.png$/.test(p.sourceUrl||'') && !/^data:image\/png;base64,[a-zA-Z0-9+/=]+$/.test(p.sourceUrl||'')) p.sourceUrl='';
  p.settings={...p.settings,lipSyncMode:'open-close',vowels:false};
  if(p.settings.mouthTuning)p.settings.mouthTuning=normalizeMouthTuning(p.settings.mouthTuning);
  if(p.rig)p.rig=normalizeRig(p.rig,p);
  return p;
}
export function adoptProject(p,{saved=false}={}) {
  if(recording) throw Error('録画完了後にプロジェクトを開いてください');
  mouthEditor?.close({rebuild:false});
  outputs?.reset();
  motionAssistResult?.update(null);
  project=validateProject(p); selected=null; time=0; playing=true;
  manualVowel=null;mouthPreview=null;heldEye="";editor?.resetHold();
  if(project.rig?.segmented&&!project.rig.seamWeights)project.rig.seamPending=true;
  $('projectName').textContent=project.name; $('canvasInfo').textContent=`${project.width} × ${project.height} px`;
  $('partCount').textContent=project.parts.length;
  $('pathInfo').textContent=`${project.parts.reduce((s,p)=>s+(p.paths||0),0).toLocaleString()} PATHS`;
  $('originalImage').src=project.sourceUrl || '';
  $('noPart').hidden=false;$('partFields').hidden=true;
  setSettings(project.settings); renderLayers(); rebuild(); updateView(); $('play').textContent='Ⅱ';
  
  document.querySelector('[data-motion-page=iris]').hidden=false;
  $('splitMotionControls').hidden=!project.rig?.segmented;
  $('armMotionControls').hidden=!project.rig?.segmented;
  $('unsplitHairControls').hidden=!!project.rig?.segmented;
  $('splitMotionHint').hidden=!!project.rig?.segmented;
  if(project.conversion?.motionParts)$('motionParts').checked=true;
  const voice=project.voiceSettings;
  $('speechReading').value=voice?.reading??((voice?.text??defaultSpeech)===defaultSpeech?defaultReading:'');
  ttsUI.restore(voice?.ttsConfig,voice?.engine);
  if(voice){$('speechText').value=String(voice.text||'').slice(0,200);$('gain').value=clamp(voice.gain??5,1,20);$('gainOut').value=$('gain').value;}
  if(project.conversion) {
    $('quality').value=project.conversion.preset || 'balanced';
    $('cleanup').checked=!!project.conversion.lineCleanup;
    $('alphaThreshold').value=project.conversion.alphaThreshold ?? 12;
  }
  status(`${project.parts.length}パーツを読み込みました。`+(project.conversion?.eyePlateRepair==='psd-skin-color-match-v1'?'PSDの顔レイヤーから目元の下地を自動補修しました。':'役割と重なりを調整できます。'));
  if(project.warnings?.length) {
    $('warningText').replaceChildren(...project.warnings.map(t=>{const p=document.createElement('p');p.textContent=t;return p;}));
    $('warnings').showModal();
  }
  editor?.refresh();
  mouthEditor?.refresh();
  workspaceUI?.imported();
  void restoreSourceEyelids(project);
  rasterReady=restoreRasterSources(project);
  if(project.rig?.seamPending){const target=project;void ensureSeamRig(target).then(()=>{if(project===target)rebuild();}).catch(e=>{if(project===target)status('境界の準備に失敗しました: '+e.message,true);});}
  saveGuard?.reset(saved);
  document.dispatchEvent(new Event('projectloaded'));
}
async function restoreRasterSources(target){
  for(const p of target.parts){
    const source=p.artworkSources?.[p.artworkSource];
    if(!source||p.rasterSourceUrl||p.rasterDisabled)continue;
    const signature=await svgSignature(p.svgText);
    if(signature===await svgSignature(source.svgText)){p.rasterSourceUrl=source.originalUrl;p.rasterSignature=signature;}
  }
  if(target.conversion?.mode!=='hybrid'||!/^[a-f0-9]{32}$/.test(target.id||''))return;
  try{
    const original=await (await request(`/api/projects/${target.id}`)).json();let changed=false;
    for(const p of target.parts){
      if(target.backgroundRepair?.method==='psd-protected-background-and-hair-v3'&&p.role==='static'&&!p.spatialBounds&&!p.rasterDisabled&&p.rasterSignature){
        const source=original.parts.find(v=>v.id===p.id&&v.width===p.width&&v.height===p.height);
        // Older background repairs dropped culling bounds despite keeping all art paths.
        const paths=text=>(text.replace(/<defs\b[\s\S]*?<\/defs>/g,'').match(/<path\b[^>]*\/>/g)||[]).map(p=>p.replace(/\s+id="[^"]*"/g,'').replace(/url\(#[^)]+\)/g,'url(#ref)')).join('');
        if(source?.spatialBounds&&await svgSignature(p.svgText)===p.rasterSignature&&paths(p.svgText)===paths(sanitizeSvg(source.svgText,'bounds-'))){p.spatialBounds=source.spatialBounds;changed=true;}
      }
      if(p.role==='mouth'&&p.mouthMode==='source-open'&&!p.mouthInteriorSvg&&!p.rasterDisabled){
        const source=original.parts.find(v=>v.role==='mouth'&&v.name===p.name&&['x','y','width','height'].every(k=>v[k]===p[k]));
        if(source?.mouthInteriorSvg&&await svgSignature(p.svgText)===await svgSignature(sanitizeSvg(source.svgText,'mouth-source-'))){p.mouthInteriorSvg=sanitizeSvg(source.mouthInteriorSvg,`inside-${p.id}-`);changed=true;}
      }
      if(p.role!=='static'||p.rasterDisabled||p.rasterSourceUrl)continue;
      const source=original.parts.find(v=>v.name===p.name&&v.width===p.width&&v.height===p.height);
      if(!source)continue;
      const signature=await svgSignature(p.svgText),originalSignature=await svgSignature(sanitizeSvg(source.svgText,'original-'));
      if(signature!==originalSignature)continue;
      p.rasterSourceUrl=source.originalUrl;p.rasterSignature=signature;changed=true;
    }
    if(changed&&project===target){rebuild();mouthEditor?.refresh();}
  }catch{} // Offline or edited assets continue rendering their saved SVG.
}
async function restoreSourceEyelids(target) {
  const pending=target.parts.filter(p=>p.role.startsWith('lash-'));
  if(!pending.length||!/^[a-f0-9]{32}$/.test(target.id||''))return;
  try {
    const source=await(await request(`/api/projects/${target.id}`)).json();
    if(project!==target)return;
    const signature=text=>text.replace(/\bid="[^"]*"/g,'id="ref"').replace(/url\(#[^)]+\)/g,'url(#ref)').replace(/\bhref="#[^"]+"/g,'href="#ref"');
    let changed=false;
    for(const p of pending){
      const original=source.parts.find(q=>q.name===p.name&&q.role===p.role&&['x','y','width','height'].every(k=>q[k]===p[k]));
      if(!original?.closedSvgText)continue;
      // Never put an old character's lashes over a user-replaced SVG.
      if(signature(sanitizeSvg(original.svgText,'compare-'))!==signature(p.svgText))continue;
      if(p.closedSvgText){
        const previous=original.previousClosedSvgTexts||[original.legacyClosedSvgText].filter(Boolean);
        if(!previous.some(text=>signature(sanitizeSvg(text,'compare-'))===signature(p.closedSvgText)))continue;
      }
      p.closedSvgText=sanitizeSvg(original.closedSvgText,`lid-${p.id}-`);changed=true;
    }
    if(changed)rebuild();
  }catch{/* A portable project can be used without its original conversion directory. */}
}
function rebuild() {
  secondaryUI?.refresh();
  if(project){
    const hasChest=project.parts.some(p=>p.visible&&p.role==='chest')||!!chestRegion(project);
    $('chest').disabled=!hasChest;
    $('chestMotionHint').textContent=hasChest?'胸元の揺れを調整します。0にすると止まります。':'胸元の位置を確認できません。胴体を含む素材を読み込んでください。';
    $('hairAccessoryControls').hidden=!project.parts.some(p=>p.visible&&p.role==='hair');
    const earSelect=$('earTarget');earSelect.replaceChildren(new Option('耳の役割があるレイヤー','auto'),new Option('なし','none'));
    for(const p of project.parts)earSelect.append(new Option(p.name+(p.visible?'':'（非表示）'),p.id));
    earSelect.value=earLayerSelection(project);
    const hasEars=project.parts.some(p=>p.visible&&earEnabled(p));
    $('earPivotPick').disabled=project.parts.filter(p=>p.visible&&earEnabled(p)).length!==1;
    for(const id of ['ears','earPattern','earCycles'])$(id).disabled=!hasEars;
    $('earMotionHint').textContent=hasEars?'頻度は1ループの回数です。大きさを0にすると止まります。':'headwearなど、ピコピコさせたいレイヤーを選んでください。';
    $('tailMotionControls').hidden=!project.parts.some(p=>p.visible&&p.role==='tail');
    const armSelect=$('armPivotTarget'),chosen=armSelect.value;
    armSelect.replaceChildren();
    for(const group of ['arm-r','arm-l']){const parts=project.parts.filter(p=>p.visible&&p.deformGroup===group);if(parts.length){const option=document.createElement('option');option.value=group;option.textContent=parts.map(p=>p.name).join('・');armSelect.append(option);}}
    if([...armSelect.options].some(o=>o.value===chosen))armSelect.value=chosen;
    $('armPivotPick').disabled=!armSelect.options.length;
  }
  if(!project)return;
  const hasForeground=foregroundHairIds(project).size>0;
  $('eyeThroughHair').disabled=!hasForeground;
  $('eyeThroughHairHint').textContent=hasForeground?'前髪と重なる睫毛だけを、瞬きに合わせて薄く表示します。':'表示中の睫毛より手前に、前髪レイヤーが必要です。';
  const ready=project.parts.some(p=>p.visible&&p.role==='mouth'&&(p.openSvgText||p.mouthMode==='source-open'||p.mouthMode==='synthetic'));
  $('mouthAssetHint').hidden=ready;
  $('voiceMouthStatus').textContent=ready?'口パク準備OK：音声に合わせて口が開閉します。':'音声は生成・再生できます。口パクには開いた口の素材を追加してください。';
  $('voiceMouthSetup').hidden=ready;
  const owner=project,renderProject=livePreview?{...project}:project;
  if(livePreview)Object.defineProperty(renderProject,'settings',{get:()=>({...owner.settings,background:'transparent'})});
  previewRenderer?.dispose();previewRenderer=null;svg=null;
  const generation=++previewGeneration,art=$('artboard');
  art.replaceChildren();art.setAttribute('aria-busy','true');
  const loading=document.createElement('div');loading.className='preview-loading';loading.setAttribute('role','status');
  loading.innerHTML='<span>プレビューを準備しています…</span><small>準備ができるとキャラクターを表示します</small>';art.append(loading);
  const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
  previewReady=(async()=>{
    // Let the loading state paint before parsing and rasterizing the source SVGs.
    await nextFrame();await nextFrame();
    if(generation!==previewGeneration)return;
    let renderer;
    try{
      renderer=await prepareCanvasRenderer(renderProject,1024);
      if(generation!==previewGeneration){renderer.dispose();return;}
      // Warm the first frame before exposing the canvas.
      renderer.draw(currentPose());await nextFrame();
      if(generation!==previewGeneration){renderer.dispose();return;}
      renderer.draw(currentPose());
      previewRenderer=renderer;renderer.canvas.className='rig-preview preview-reveal';renderer.canvas.ariaLabel='頭・顔・髪の変形プレビュー';
      art.replaceChildren(renderer.canvas);art.setAttribute('aria-busy','false');lastTick=performance.now();
      editor?.drawGuide();pivotPicker?.refresh();
    }catch(err){
      renderer?.dispose();
      if(generation===previewGeneration){art.setAttribute('aria-busy','false');loading.textContent='プレビューを準備できませんでした。';const retry=document.createElement('button');retry.textContent='もう一度試す';retry.onclick=rebuild;loading.append(retry);status('変形プレビューを準備できませんでした: '+err.message,true);}
    }
  })();
}
function renderLayers() {
  artworkSources?.refresh();
  const scrollTop=$('layers').scrollTop;
  $('layers').replaceChildren();
  for(const p of [...project.parts].reverse()) {
    const row=document.createElement('div');row.className='layer'+(p.id===selected?' selected':''); row.tabIndex=0;
    row.dataset.partId=p.id;row.title='上下にドラッグで重なり順を変更（Alt＋↑↓でも移動）';
    const grip=document.createElement('span');grip.className='layer-grip';grip.textContent='⠿';grip.ariaHidden='true';
    const thumb=document.createElement('img');thumb.alt='';thumb.draggable=false;if(p.originalUrl)thumb.src=p.originalUrl;
    const text=document.createElement('div');const name=document.createElement('div');name.className='layer-name';name.textContent=p.name;name.title=p.name;
    const role=document.createElement('div');role.className='layer-role';role.textContent=p.faceOverlay?'眉に追従':p.blinkOverlay?'目元に追従・瞬きに連動':({'front':'前髪・独立した揺れ','back':'後ろ髪・毛先の揺れ','arm-r':'右腕・肩を支点に回転','arm-l':'左腕・肩を支点に回転'})[p.deformGroup]||rolesJa[p.role];text.append(name,role);
    const visible=document.createElement('input');visible.type='checkbox';visible.checked=p.visible;visible.ariaLabel=`${p.name}の表示`;
    visible.addEventListener('click',e=>e.stopPropagation());visible.addEventListener('change',()=>{p.visible=visible.checked;rebuild();});
    text.className='layer-text';row.append(grip,thumb,text,visible);row.addEventListener('click',()=>selectPart(p.id));row.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target===row)selectPart(p.id);});
    $('layers').append(row);
  }
  $('layers').scrollTop=scrollTop;
}
installLayerSort($('layers'),(id,beforeId)=>{
  if(!project||!reorderLayers(project.parts,id,beforeId))return;
  selectPart(id);rebuild();
  const row=[...$('layers').children].find(r=>r.dataset.partId===id);
  row?.focus({preventScroll:true});row?.scrollIntoView({block:'nearest'});
  status(`${project.parts.find(p=>p.id===id).name}の重なり順を変更しました。上が手前です。`);
});
function selectPart(id) {
  selected=id;const p=project.parts.find(p=>p.id===id);renderLayers();
  svg?.querySelectorAll('[data-part]').forEach(node=>node.classList.toggle('selected-part',node.dataset.part===id));
  $('partEditor').open=true;$('noPart').hidden=true;$('partFields').hidden=false;$('selectedName').textContent=p.name;
  $('partRole').value=p.role;$('partOpacity').value=p.opacity;
  $('partPivotPick').hidden=!(p.deformGroup?.startsWith('arm-')||p.role==='hair'||p.role==='tail'||!!secondaryKind(p)||earEnabled(p));
  $('mouthMode').value=p.mouthMode||'source-closed';$('mouthModeLabel').hidden=p.role!=='mouth';
  workspaceUI?.editPage('parts');editor?.refresh();
}
function updateView() {
  $('stage').classList.toggle('compare',view==='compare');
  $('artboard').hidden=view==='original';$('originalWrap').hidden=view==='motion';
  if(view!=='motion'&&!project?.sourceUrl)status('元画像を含まないプロジェクトです。比較にはPSDを読み込んでください。');
}
function selectTab(name) {
  if(workspaceUI){workspaceUI.show(name);return;}
  for(const b of document.querySelectorAll('[data-tab]'))b.classList.toggle('active',b.dataset.tab===name);
  for(const n of ['motion','voice','tracking'])$(`tab-${n}`).hidden=n!==name;
}
async function refreshProjects() {
  const list=await (await request('/api/projects')).json();
  $('recent').replaceChildren(new Option('保存済みの変換を開く…',''),...list.map(p=>new Option(`${p.name} · ${p.parts} parts`,p.id)));
  return list;
}
async function importHybrid() {
  if(recording) throw Error('録画完了後に素材を読み込んでください');
  if(importing)throw Error('変換中です');
  const original=$('hybridOriginal').files[0],psd=$('hybridPsd').files[0],depth=$('hybridDepth').files[0];
  if(!original||!psd)throw Error('元画像と対応するPSDの両方を選んでください');
  if(!/\.(png|jpe?g|webp)$/i.test(original.name)||!/\.psd$/i.test(psd.name))throw Error('元画像はPNG・JPG・WebP、分離素材はPSDを選んでください');
  if([original,psd].some(file=>file.size>100*1024**2))throw Error('各ファイルは100MB以下にしてください');
  const form=new FormData();form.set('original',original);form.set('psd',psd);form.set('open_features','true');
  if(depth){if(!/\.psd$/i.test(depth.name)||depth.size>100*1024**2)throw Error('Depthは100MB以下のPSDを選んでください');form.set('depth_psd',depth);}
  const donors=importFlow.files();
  for(const [key,file] of Object.entries(donors)){if(!/\.psd$/i.test(file.name)||file.size>100*1024**2)throw Error('追加差分は各100MB以下のPSDを選んでください');form.set(key,file);}
  form.set('preset',$('quality').value);form.set('cleanup',$('cleanup').checked);form.set('alpha',$('alphaThreshold').value);form.set('motion_parts',$('motionParts').checked);
  const aiRequest=assistEntry.options();if(aiRequest.enabled){form.set('defer','true');form.set('assist_wish',aiRequest.wish);form.set('assist_generation',String(aiRequest.allow_generation));}
  if(Object.keys(donors).length||depth){
    const health=await (await request('/api/health')).json();if(depth&&!health.depthImport)throw Error('Depth PSDを読み込むには、SVG-Through Motionを起動し直してください');if(Object.keys(donors).length&&!health.faceDonorImport)throw Error('追加PSDを読み込むには、SVG-Through Motionを終了して起動し直してください');
  }
  importing=true;$('sourceProgress').hidden=false;$('sourceProgress').value=0;$('progress').hidden=false;$('progress').value=0;$('importFields').disabled=true;$('hybridImport').textContent='変換中…';
  try {
    status('元画像とPSDを読み込んでいます…');
    const registered=await (await request('/api/import/hybrid',{method:'POST',body:form})).json();
    if(registered.input_id){await outputs.connectForAssist();assistEntry.handoff(registered.input_id);status('素材を登録しました。AIに依頼を渡してください。');return;}
    const {jobId}=registered;
    let job;
    do {
      await new Promise(r=>setTimeout(r,700));job=await (await request(`/api/jobs/${jobId}`)).json();
      $('sourceProgress').value=$('progress').value=job.progress;status(job.message);
    }while(job.state==='running'||job.state==='queued');
    if(job.state==='error')throw Error(job.message.replace(/\b(lash-r|lash-l|mouth)\b(?= レイヤーが見つからないか空です)/g,key=>({'lash-r':'eyelash-r（右のまつ毛）','lash-l':'eyelash-l（左のまつ毛）',mouth:'mouth（口）'}[key])));
    adoptProject(await (await request(`/api/projects/${job.projectId}`)).json());await refreshProjects();
  } finally {importing=false;$('sourceProgress').hidden=true;$('progress').hidden=true;$('importFields').disabled=false;$('hybridImport').textContent=aiRequest.enabled?'素材を登録してAIに渡す':'読み込んで編集を始める';}
}

function currentPose() {
  if(inShapeEditor()&&!pivotPicker?.active)return editingPose(+$('editEyeClosure').value,+$('mouth').value);
  const pose=loopPose(time,settings());
  if(pivotPicker?.active){pose.pivotOverrides=pivotPicker.overrides;pose.neckPivot=pivotPicker.neckOverride;}
  if(heldEye){pose.blinkL=heldEye==='both'||heldEye==='l'?1:0;pose.blinkR=heldEye==='both'||heldEye==='r'?1:0;}
  if(performance.now()<testBlinkUntil){pose.blinkL=1;pose.blinkR=1;}
  if(mouthEditor?.active&&manualVowel&&+$('mouth').value>0){pose.vowel=manualVowel;delete pose.vowelWeights;}
  if(analyser&&(!$('audio').paused||voiceMouth>0))pose.mouth=voiceMouth;
  if(speechActive||browserMouth>0)pose.mouth=browserMouth;
  if(speechActive||!$('audio').paused){
    delete pose.vowelWeights;pose.vowel='a';

  }
  if(mouthEditor?.active&&mouthPreview!==null&&!speechActive&&!browserMouth&&!voiceMouth&&$('audio').paused){pose.mouth=+$('mouth').value;delete pose.vowelWeights;pose.vowel=mouthPreview==='closed'?'a':mouthPreview;}
  return outputs?outputs.applyPose(pose,speechActive||browserMouth>0||voiceMouth>0||!$('audio').paused):pose;
}
function frame(now) {
  const delta=Math.min((now-lastTick)/1000,.1);lastTick=now;
  if(playing&&project&&(!inShapeEditor()||pivotPicker?.active))time=(time+delta)%settings().duration;
  if(analyser&&!$('audio').paused){const samples=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(samples);voiceMouth=voiceEnvelope.sample(samples,+$('gain').value,now);}
  else voiceMouth=voiceEnvelope.step(0,now);
  browserMouth=browserEnvelope.step(speechActive?Math.max(0,Math.sin((now-speechStarted)/125))*.65*(+$('gain').value/5):0,now);
  const pose=currentPose();$('voiceMeter').style.width=((speechActive?pose.mouth:voiceMouth)*100)+'%';
  outputs?.push(pose,now);
  const vowel=pose.vowel||vowels[pose.vowelWeights?.indexOf(Math.max(...(pose.vowelWeights||[])))];
  const label=$('vowels').checked&&pose.mouth>.05?('あいうえお'[vowels.indexOf(vowel)]||'あ'):'閉';
  if($('vowelNow').textContent!==label)$('vowelNow').textContent=label;
  const frameKey=inShapeEditor()?JSON.stringify([pose,previewGeneration,project?.settings]):'';
  if(!materialsRendering&&!mouthEditor?.active&&(!inShapeEditor()||frameKey!==staticFrameKey)){
    if(previewRenderer)previewRenderer.draw(pose);else if(svg&&project)applyPose(svg,pose,project);
    staticFrameKey=frameKey;$('stage').dataset.drawCount=String(+( $('stage').dataset.drawCount||0)+1);
  }
  $('scrubber').value=time;$('timeValue').textContent=time.toFixed(2).padStart(5,'0');
  if(pivotPicker?.active)pivotPicker.refresh();
  if($('play').textContent!==(playing?'Ⅱ':'▶'))$('play').textContent=playing?'Ⅱ':'▶';
  requestAnimationFrame(frame);
}

async function download(data,name,type) {
  const blob=data instanceof Blob?data:new Blob([data],{type});
  const saved=await (await request('/api/exports/'+encodeURIComponent(name),{method:'POST',body:blob})).json();
  showExport(saved,name);
  return saved;
}
function showExport(saved,name){const link=$('lastExport');link.href=saved.url;link.textContent=name+' ↗';link.title=saved.path;link.hidden=false;}
function staticSvg(pose=currentPose()) {
  const root=parseSvg(sceneSvg(project,settings()));applyPose(root,pose,project);return new XMLSerializer().serializeToString(root);
}
async function renderCanvas(text,canvas) {
  const url=URL.createObjectURL(new Blob([text],{type:'image/svg+xml'}));
  try {const img=new Image();img.src=url;await img.decode();const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);}finally{URL.revokeObjectURL(url);}
}
async function portableProject(source=null) {
  await rasterReady;
  const copy=structuredClone(source||project);if(!source)copy.settings=settings();
  copy.voiceSettings={ttsConfig:ttsUI.snapshot(),engine:$('engine').value,text:$('speechText').value,reading:$('speechReading').value,gain:+$('gain').value};
  const toData=async url=>{
    if(!url||url.startsWith('data:'))return url;
    const blob=await (await request(url)).blob();return await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob);});
  };
  copy.sourceUrl=await toData(copy.sourceUrl);
  for(const p of copy.parts){p.originalUrl=await toData(p.originalUrl);if(p.rasterSourceUrl)p.rasterSourceUrl=await toData(p.rasterSourceUrl);for(const a of Object.values(p.artworkSources||{}))a.originalUrl=await toData(a.originalUrl);}
  return copy;
}

// Portable ZIP writer (STORE), including UTF-8 names and CRC32. No CDN dependency.

async function exportLoopMp4() {
  const wasPlaying=playing;recording=true;playing=false;$('exportVideo').disabled=true;$('exportMp4').disabled=true;
  let renderer;
  try {
    const copy=structuredClone(project),s={...settings(),background:'white'};copy.settings=s;
    status('MP4用のパーツを準備しています…');
    renderer=await prepareCanvasRenderer(copy,1080,{allowUpscale:true,supersample:2});
    const mp4=await streamLoopMp4(renderer,s,request,status);showExport(mp4,'svg-through-motion.mp4');
    status(`${s.duration}秒・30fpsのMP4を data/exports に保存しました。`);
  }finally{renderer?.dispose();recording=false;playing=wasPlaying;$('exportVideo').disabled=false;$('exportMp4').disabled=false;}
}
async function exportVideo(format='webm') {
  await rasterReady;
  needProject();if(recording)throw Error('録画中です');
  if(format==='mp4'&&$('audio').paused&&!speechActive)return exportLoopMp4();
  if(!window.MediaRecorder)throw Error('このブラウザはWebM録画に対応していません');
  const mime=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(m=>MediaRecorder.isTypeSupported(m));
  if(!mime)throw Error('WebMに対応したChromeかEdgeで開いてください');
  const wasPlaying=playing;recording=true;$('exportVideo').disabled=true;$('exportMp4').disabled=true;playing=false;
  status('動画用のパーツを準備しています…');
  let renderer;
  try {const copy=structuredClone(project);if(format==='mp4')copy.settings.background='white';renderer=await prepareCanvasRenderer(copy,1080,{allowUpscale:true,supersample:2});}
  catch(err){recording=false;playing=wasPlaying;$('exportVideo').disabled=false;$('exportMp4').disabled=false;throw err;}
  const {canvas}=renderer;
  const hasAudio=analyser&&!$('audio').paused;
  if(!hasAudio&&!speechActive)time=0;
  renderer.draw(currentPose());
  const captured=canvas.captureStream(30),videoTrack=captured.getVideoTracks()[0];
  if(hasAudio&&mediaDestination)for(const track of mediaDestination.stream.getAudioTracks())captured.addTrack(track.clone());
  const recorder=new MediaRecorder(captured,{mimeType:mime,videoBitsPerSecond:12_000_000});const chunks=[];
  let encoderStarted=false;recorder.onstart=()=>{encoderStarted=true;};
  const done=new Promise((resolve,reject)=>{recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onstop=resolve;recorder.onerror=e=>reject(e.error||Error('録画に失敗しました'));});
  try {
    // Prime the capture track before starting its clock so the first encoded frame
    // is ready, rather than losing the encoder's startup time from a short clip.
    await new Promise(resolve=>setTimeout(resolve,120));
    recorder.start(200);
    // MediaRecorder may take over a second to accept its first frame at 1080px.
    // Keep feeding it frames while waiting: awaiting onstart without drawing
    // can deadlock captureStream. Count the requested duration after startup.
    const startup=performance.now();
    while(!encoderStarted){
      renderer.draw(currentPose());videoTrack.requestFrame?.();
      await new Promise(r=>setTimeout(r,1000/30));
      if(performance.now()-startup>15000)throw Error('動画エンコーダーを開始できませんでした。もう一度書き出してください。');
    }
    if(!hasAudio&&!speechActive)time=0;
    playing=true;
    const start=performance.now(),duration=settings().duration*1000;
    status(`WebMを録画中… ${settings().duration}秒${hasAudio?'・音声あり':'・無音'}`);
    while(performance.now()-start<duration) {
      renderer.draw(currentPose());videoTrack.requestFrame?.();
      status(`動画を録画中… ${Math.min(100,Math.round((performance.now()-start)/duration*100))}%`);
      await new Promise(r=>setTimeout(r,1000/30));
    }
    renderer.draw(currentPose());videoTrack.requestFrame?.();
    await new Promise(resolve=>setTimeout(resolve,60));
    recorder.stop();await done;const saved=await download(new Blob(chunks,{type:mime}),'svg-through-motion.webm');
    if(format==='mp4'){
      status('SNS用MP4に変換しています…');
      const mp4=await (await request(saved.url+'/mp4',{method:'POST'})).json();showExport(mp4,'svg-through-motion.mp4');
    }
    status(`${format.toUpperCase()}を data/exports に保存しました。`);
  }finally{if(recorder.state!=='inactive')recorder.stop();captured.getTracks().forEach(t=>t.stop());recording=false;playing=wasPlaying;$('exportVideo').disabled=false;$('exportMp4').disabled=false;}
}

async function ensureAudio() {
  if(!audioContext) {
    audioContext=new AudioContext();analyser=audioContext.createAnalyser();analyser.fftSize=1024;
    mediaDestination=audioContext.createMediaStreamDestination();audioSource=audioContext.createMediaElementSource($('audio'));
    audioSource.connect(analyser);analyser.connect(audioContext.destination);analyser.connect(mediaDestination);
  }
  await audioContext.resume();
}
function voiceStatus(text,error=false){
  status(text,error);$('voiceStatus').textContent=text;$('voiceStatus').style.color=error?'#a44b35':'';
}
function stopVoice() {
  voiceGeneration++;synthController?.abort();synthController=null;
  window.speechSynthesis?.cancel();$('speak').disabled=false;$('speak').textContent='生成して話す';speechActive=false;$('audio').pause();voiceMouth=0;browserMouth=0;voiceTokens=[];voiceEnvelope.reset();browserEnvelope.reset();
}
async function setAudio(blob, isWav=false) {
  const generation=voiceGeneration;
  voiceEnvelope.reset();
  if(audioUrl)URL.revokeObjectURL(audioUrl);
  audioUrl=URL.createObjectURL(blob);$('audio').src=audioUrl;lastWav=isWav?blob:null;$('saveAudio').disabled=!lastWav;
  await ensureAudio();if(generation!==voiceGeneration)return;await $('audio').play();if(generation===voiceGeneration)playing=true;
}
function ttsBody(){return ttsUI.body($('speechText').value);}
async function speak() {
  needProject();stopVoice();const text=$('speechText').value.trim();if(!text)throw Error('セリフを入力してください');
  const generation=voiceGeneration;
  const canLipSync=project.parts.some(p=>p.visible&&p.role==='mouth'&&(p.openSvgText||p.mouthMode==='source-open'||p.mouthMode==='synthetic'));
  const note=canLipSync?'口パクと連動します。':'開いた口の素材が未設定のため、音声のみ再生します。';
  voiceTokens=[];
  $('speak').disabled=true;$('speak').textContent='準備中…';voiceStatus('音声を準備しています。'+note);
  try {
    await ensureAudio();if(generation!==voiceGeneration)return;
    if($('engine').value==='browser') {
      const controller=new AbortController();synthController=controller;lastWav=null;$('saveAudio').disabled=true;
      voiceStatus('ブラウザ音声を開始しています。'+note);
      await browserSpeech(text,{signal:controller.signal,voice:ttsUI.browserVoice,onstart(){if(generation!==voiceGeneration)return;speechStarted=performance.now();speechActive=true;playing=true;$('speak').textContent='読み上げ中…';voiceStatus('ブラウザ音声で読み上げ中。'+note);}});
      if(generation!==voiceGeneration)return;
      speechActive=false;synthController=null;$('speak').disabled=false;$('speak').textContent='生成して話す';voiceStatus('読み上げが終わりました。'+note);return;
    }
    const health=await (await request('/api/health')).json();
    if(!health.ttsEngines?.includes($('engine').value))throw Error('音声エンジン対応を反映するため、アプリのサーバーを起動し直してください。');
    if(generation!==voiceGeneration)return;
    const controller=new AbortController();synthController=controller;
    $('speak').textContent='生成中…';voiceStatus(ttsUI.name+'で音声を生成しています。'+note);
    const response=await postJson('/api/tts/synthesize',ttsBody(),controller.signal);
    const blob=await response.blob();if(generation!==voiceGeneration)return;
    await setAudio(blob,true);if(generation!==voiceGeneration)return;
    voiceStatus('生成した音声を再生中。'+note+' WAVを保存できます。');
    $('speak').disabled=false;$('speak').textContent='生成して話す';synthController=null;
  }catch(error){
    if(generation!==voiceGeneration)return;
    speechActive=false;$('speak').disabled=false;$('speak').textContent='生成して話す';synthController=null;
    throw error;
  }
}
for(const id of ['depthEnabled','depthStrength','tailSwing','tailCycles','irisGaze','earPattern','earCycles','irisX','irisScale','irisCycles','duration','sway','breathe','blink','talking','singleBounce','bounceHeight','hair','chest','ears','headPitch','pitchSway','headTilt','headYaw','headNod','bodyFollow','hairBend','frontHair','backHair','frontHairCycles','backHairCycles','armSwing','springCycles','hairMethod','frontHairMethod','backHairMethod','vowels'])$(id).addEventListener('input',updateSettings);
$('rigEnabled').onchange=()=>{if(project&&!project.rig)project.rig=normalizeRig({},project);updateSettings();rebuild();};
$('renderSource').onchange=()=>{updateSettings();rebuild();};
$('eyeThroughHair').onchange=()=>{updateSettings();rebuild();};
$('eyeThroughHairStrength').oninput=()=>{updateSettings();};
$('rigMode').onchange=()=>{updateSettings();rebuild();};
$('importForm').onsubmit=safe(e=>{e.preventDefault();return importHybrid();});
$('outputBackground').onchange=()=>{updateSettings();rebuild();};
for(const b of document.querySelectorAll('[data-tab]'))b.onclick=()=>selectTab(b.dataset.tab);
for(const b of document.querySelectorAll('[data-mode]'))b.onclick=()=>{mouthEditor?.close();view=b.dataset.mode;for(const a of document.querySelectorAll('[data-mode]'))a.classList.toggle('active',a===b);updateView();};
$('resetMotion').onclick=()=>{if(!project)return;for(const p of project.parts)delete p.secondaryMotion;setSettings((project.sampleMotionDefault?sampleMotionSettings:naturalMotionSettings)(settings()));time=0;playing=true;rebuild();status(project.sampleMotionDefault?'動きをサンプルの初期設定に戻しました。':'動きを自然な待機に戻しました。');};
$('play').onclick=()=>{if(!project)return;playing=!playing;$('play').textContent=playing?'Ⅱ':'▶';};
$('resetTime').onclick=()=>{time=0;};$('scrubber').oninput=()=>{playing=false;time=+$('scrubber').value;$('play').textContent='▶';};
$('mouth').oninput=()=>{$('mouthOut').value=Math.round(+$('mouth').value*100)+'%';};
$('blinkTest').onclick=()=>{testBlinkUntil=performance.now()+400;};
$('neutral').onclick=()=>{mouthPreview=null;editor?.resetHold();$('mouth').value=0;$('mouthOut').value='0%';testBlinkUntil=0;manualVowel=null;};
for(const button of document.querySelectorAll('[data-vowel]'))button.onclick=safe(()=>{
  needProject();mouthPreview=null;manualVowel=button.dataset.vowel;$('vowels').checked=true;$('mouth').value=1;$('mouthOut').value='100%';updateSettings();
  status(`「${button.textContent}」の口を確認中。「戻す」で自動の口パクに戻ります。`);
});
$('speechText').addEventListener('input',()=>{$('speechReading').value='';});
$('applyReading').onclick=safe(()=>{
  if(!$('audio').getAttribute('src'))throw Error('先に音声ファイルまたは生成音声を読み込んでください');
  const tokens=kanaTrack($('speechReading').value.trim());if(!tokens.length)throw Error('母音の読みをひらがな・カタカナで入力してください');
  voiceTokens=tokens;status('母音の読みを音声全体の長さに割り当てました。音素時刻は推定です。');
});
$('zoomIn').onclick=()=>mouthEditor?.active?mouthEditor.zoom(1.25):workArea.zoom(1.25);
$('zoomOut').onclick=()=>mouthEditor?.active?mouthEditor.zoom(.8):workArea.zoom(.8);
$('resetWorkView').onclick=()=>mouthEditor?.active?mouthEditor.resetView():workArea.reset();
$('editEyeClosure').oninput=()=>{$('eyeClosureOut').value=Math.round(+$('editEyeClosure').value*100)+'%';};
$('mouth').addEventListener('input',()=>mouthEditor?.redraw());
$('background').onclick=()=>{$('outputBackground').value=$('outputBackground').value==='white'?'transparent':'white';updateSettings();rebuild();};

$('recent').onchange=safe(async()=>{if($('recent').value)adoptProject(await (await request(`/api/projects/${$('recent').value}`)).json());});
$('closeWarnings').onclick=()=>$('warnings').close();
function editableState(){
 if(!project)return '';
 const keys=['secondaryMotion','id','name','role','x','y','width','height','visible','opacity','pivotX','pivotY','motionStrength','earMotion','faceBase','mouthMode','svgText','closedSvgText','openSvgText','lidAdjust','hairControl','rasterDisabled','closedSource'];
 const rig=Object.fromEntries(Object.entries(project.rig||{}).filter(([k])=>!['seamWeights','seamPending','seamVersion'].includes(k)));
 return JSON.stringify({name:project.name,parts:project.parts.map(p=>Object.fromEntries(keys.filter(k=>p[k]!==undefined).map(k=>[k,p[k]]))),rig,settings:settings(),voice:{tts:ttsUI.snapshot(),text:$('speechText').value,reading:$('speechReading').value,gain:$('gain').value}});
}
async function saveProject(){
 needProject();if(savingProject)throw Error('保存中です。少し待ってください。');
 savingProject=true;$('editingWorkspace').inert=true;
 try{
  const state=editableState(),portable=await portableProject();portable.savedAt=new Date().toISOString();let thumbnail='';
  try{await previewReady;const c=document.createElement('canvas');c.width=160;c.height=Math.round(160*project.height/project.width);c.getContext('2d').drawImage(previewRenderer.canvas,0,0,c.width,c.height);thumbnail=c.toDataURL('image/webp',.7);}catch{}
  const saved=await download(JSON.stringify(portable),'svg-through-motion.project.json','application/json');
  rememberCharacter(saved,project.name,{savedAt:portable.savedAt,thumbnail});saveGuard?.saved(state);
  status('プロジェクトを保存しました。メインメニューから続きを開けます。');return saved;
 }finally{savingProject=false;$('editingWorkspace').inert=false;}
}
document.querySelector('.brand').addEventListener('click',e=>{if(savingProject){e.preventDefault();e.stopImmediatePropagation();}},true);
$('projectInput').onchange=safe(async e=>{const f=e.target.files[0];if(!f)return;if(f.size>100*1024**2)throw Error('プロジェクトは100MB以下にしてください');adoptProject(JSON.parse(await f.text()),{saved:true});e.target.value='';});
for(const id of ['partRole','partOpacity','mouthMode'])$(id).onchange=()=>{
  const p=project?.parts.find(p=>p.id===selected);if(!p)return;
  if(id==='partRole'){p.role=$('partRole').value;delete p.pivotX;delete p.pivotY;selectPart(p.id);rebuild();return;}
  p.opacity=clamp($('partOpacity').value);
  p.mouthMode=$('mouthMode').value;renderLayers();rebuild();
};
for(const [id,delta] of [['layerUp',1],['layerDown',-1]])$(id).onclick=()=>{
  const index=project?.parts.findIndex(p=>p.id===selected);if(index<0||index==null)return;
  const next=index+delta;if(next<0||next>=project.parts.length)return;
  [project.parts[index],project.parts[next]]=[project.parts[next],project.parts[index]];renderLayers();rebuild();
};
$('exportPng').onclick=exportTask('PNG',async()=>{await rasterReady;needProject();let c;if(project.rig){const renderer=await prepareCanvasRenderer(project,Math.max(project.width,project.height),{supersample:2});renderer.draw(currentPose());c=renderer.canvas;}else{c=document.createElement('canvas');c.width=project.width;c.height=project.height;await renderCanvas(staticSvg(),c);}const blob=await new Promise(r=>c.toBlob(r));await download(blob,'svg-through-frame.png');status('現在のポーズをPNGに書き出しました。');});
$('exportVideo').onclick=exportTask('WebM',()=>exportVideo('webm'));$('exportMp4').onclick=exportTask('MP4',()=>exportVideo('mp4'));
$('voiceMouthSetup').onclick=()=>{const p=project?.parts.find(p=>p.role==='mouth'&&p.name==='mouth')||project?.parts.find(p=>p.role==='mouth');if(p)selectPart(p.id);else status('口のパーツを読み込み、役割を「口」にしてください。',true);};
$('speak').onclick=async()=>{try{await speak();}catch(error){if(error.name!=='AbortError')voiceStatus(error.message,true);}};$('stopVoice').onclick=()=>{stopVoice();voiceStatus('音声を停止しました。');};
$('audioInput').onchange=safe(async e=>{const file=e.target.files[0];if(!file)return;if(file.size>100*1024**2)throw Error('音声は100MB以下にしてください');stopVoice();await setAudio(file,false);status('音声ファイルに合わせて口パク中。');e.target.value='';});
$('audio').addEventListener('play',safe(ensureAudio));$('audio').addEventListener('error',()=>{voiceMouth=0;voiceStatus('この音声ファイルを再生できません。WAVやMP3で読み込んでください。',true);});
$('audio').addEventListener('ended',()=>voiceStatus('音声の再生が終わりました。'+(lastWav?'生成したWAVを保存できます。':'')));
$('saveAudio').onclick=safe(async()=>{if(lastWav)await download(lastWav,'svg-through-speech.wav');});
for(const [id,out] of [['gain','gainOut'],['styleWeight','styleWeightOut']])$(id).oninput=()=>{$(out).value=$(id).value;};
window.addEventListener('beforeunload',()=>{stopVoice();});
updateSettings();requestAnimationFrame(frame);
installStartSample({adopt:adoptProject,validate:validateProject});
installMainMenu({openFile:async data=>{adoptProject(data,{saved:true});await rasterReady;await ensureSeamRig(project);workspaceUI.show('live');}});
safe(async()=>{
  await refreshProjects();const saved=new URLSearchParams(location.search).get('project');
  if(saved&&/^[a-f0-9]{32}$/.test(saved)){
    const url=`/api/exports/${saved}/svg-through-motion.project.json`;
    adoptProject(await (await request(url)).json(),{saved:true});rememberCharacter({url},project.name,{savedAt:project.savedAt});
    if(new URLSearchParams(location.search).get('mode')==='use'){await rasterReady;await ensureSeamRig(project);workspaceUI.show('live');}
  }
})();

const pendingEyes=new Map();let updatingEyes=false;
async function updateEye(part){
 pendingEyes.set(part.id,part);if(updatingEyes)return;updatingEyes=true;
 try{while(pendingEyes.size){const batch=[...pendingEyes.values()];pendingEyes.clear();const owner=project;await rasterReady;await previewReady;const renderer=previewRenderer;
  if(owner!==project)continue;
  if(!renderer){rebuild();continue;}
  await Promise.all(batch.map(p=>renderer.updateClosed(p)));staticFrameKey='';
 }}catch(error){console.error('閉じ目の更新に失敗しました',error);rebuild();}finally{updatingEyes=false;}
}
pivotPicker=installPivotPicker({project:()=>project,pose:currentPose,changed(){rebuild();status('揺れの支点を変更しました。プロジェクトの保存で保持できます。');},begin(){pivotWasPlaying=playing;playing=true;view='motion';updateView();},end(){playing=pivotWasPlaying;staticFrameKey='';}});
secondaryUI=installSecondaryMotion({project:()=>project,changed(){staticFrameKey='';if(workspaceUI?.active==='motion')playing=true;},pick:parts=>pivotPicker.start(parts)});
artworkSources=installArtworkSources({project:()=>project,selected:()=>selected,changed(){renderLayers();rebuild();$('pathInfo').textContent=project.parts.reduce((sum,p)=>sum+(p.paths||0),0).toLocaleString()+' PATHS';status('パーツの絵を変更しました。プレビューで動きを確認し、プロジェクトを保存してください。');return previewReady;}});
 $('neckPivotPick').onclick=()=>{if(!project)return;updateSettings({target:$('neckPivotPick')});pivotPicker.startNeck();};
 $('tailPivotPick').onclick=()=>pivotPicker.start(project.parts.filter(p=>p.visible&&p.role==='tail'));
 $('earTarget').onchange=()=>{if(!project)return;chooseEarLayer(project,$('earTarget').value);rebuild();};
 $('earPivotPick').onclick=()=>pivotPicker.start(project.parts.filter(p=>p.visible&&earEnabled(p)));
 $('armPivotPick').onclick=()=>pivotPicker.start(project.parts.filter(p=>p.visible&&p.deformGroup===$('armPivotTarget').value));
 $('partPivotPick').onclick=()=>{const p=project?.parts.find(p=>p.id===selected);if(p)pivotPicker.start(p.deformGroup?.startsWith('arm-')?project.parts.filter(q=>q.deformGroup===p.deformGroup):[p]);};
 editor=installRigEditor({project:()=>project,selected:()=>selected,rebuild,updateEye,hold(mode){
 if(mode&&!heldEye){wasPlayingBeforeHold=playing;playing=false;}
 if(!mode&&heldEye)playing=wasPlayingBeforeHold;
 heldEye=mode;testBlinkUntil=0;
}});

let mouthEditWasPlaying=false;
mouthEditor=installMouthEditor({project:()=>project,rebuild,ready:()=>rasterReady,
 begin(){workspaceUI?.editPage('mouth');mouthEditWasPlaying=playing;playing=false;$('play').disabled=true;},end(){playing=mouthEditWasPlaying;$('play').disabled=false;},preview(shape){
 mouthPreview=shape||null;manualVowel=shape&&shape!=='closed'?shape:null;
 $('mouth').value=shape&&shape!=='closed'?1:0;$('mouthOut').value=shape&&shape!=='closed'?'100%':'0%';
 if(shape&&shape!=='closed')$('vowels').checked=true;updateSettings();
}});

const correctionSnapshot=async()=>{if(!project)return null;needProject();await rasterReady;await ensureSeamRig(project);const copy=structuredClone(project);copy.settings=settings();return copy;};
let assistPanel;
let motionAssistResult;
let assistHistory=[];
const assistSessionFor=step=>assistHistory.find(item=>item.summary.project_id===project?.id&&item.summary.status!=='cancelled'&&item.summary.steps?.includes(step))?.session_id;
async function refreshAssistHistory(){
  try{const items=await (await request('/api/assist/sessions')).json();assistHistory=[...assistHistory.filter(item=>!items.some(saved=>saved.session_id===item.session_id)),...items];workspaceUI?.refreshAssist();}
  catch(error){console.warn('AI依頼履歴を読み込めませんでした',error);}
}
function rememberAssist(state){
  if(!state)return;
  const roles=state.parts.filter(p=>state.workflow?.targets?.includes(p.id)).map(p=>p.role);
  const item={session_id:state.session_id,summary:{project_id:state.project_id,status:state.workflow?.status,steps:[...(roles.some(r=>/^lash-[lr]$/.test(r))?['eyes']:[]),...(roles.includes('mouth')?['mouth']:[])]}};
  const index=assistHistory.findIndex(old=>old.session_id===item.session_id);
  if(index<0)assistHistory.unshift(item);else assistHistory[index]=item;
  workspaceUI?.refreshAssist();
}
const assistCommand=createAssistController({
  snapshot:correctionSnapshot,download,
  store:async(sid,version,state)=>(await postJson('/api/assist/sessions/'+sid+'?expected_version='+version,state)).json(),
  list:async()=>(await request('/api/assist/sessions')).json(),load:async sid=>(await request('/api/assist/sessions/'+sid)).json(),
  prepareAsset:async spec=>(await postJson('/api/assist/asset-requests',spec)).json(),asset:async id=>(await request('/api/assist/assets/'+id)).json(),
  validateState(state){
    if(!state.session?.base||state.session.base.version!==1)throw Error('保存形式が不正です');
      const base=state.session.base,checked=validateProject(structuredClone(base));
      const strictSvg=text=>{const clean=sanitizeSvg(text,'');const parsed=new XMLSerializer().serializeToString(new DOMParser().parseFromString(text,'image/svg+xml').documentElement);if(clean!==parsed)throw Error('保存SVGに許可されていない属性があります');};
      if(base.sourceUrl!==checked.sourceUrl)throw Error('保存素材の参照先が不正です');
      for(const [i,part]of base.parts.entries()){
        if(part.id!==checked.parts[i].id)throw Error('保存パーツIDが不正です');
        for(const k of ['svgText','openSvgText','closedSvgText','mouthInteriorSvg'])if(part[k])strictSvg(part[k]);
        for(const svg of Object.values(part.mouthVariants||{}))strictSvg(svg);
        for(const k of ['originalUrl','rasterSourceUrl'])if(part[k]!==checked.parts[i][k])throw Error('保存素材の参照先が不正です');
      }
      for(const item of state.session.history||[])for(const part of item.state.parts||[])if(part.closedSvgText)strictSvg(part.closedSvgText);
  },
  async adopt(candidate){
    if(savingProject)throw Error('プロジェクトの保存完了後に補正を適用してください');
    saveGuard?.touch();
    needProject();if(recording)throw Error('書き出し完了後に補正を適用してください');
    if(project.id!==candidate.id)throw Error('操作対象のプロジェクトが変わっています');
    // Apply correction-owned shapes and motion; keep IDs, metadata, assets and voice state.
    for(const part of project.parts){const value=candidate.parts.find(p=>p.id===part.id);if(!value)throw Error('パーツ構成が変わっています');}
    for(const part of project.parts){const value=candidate.parts.find(p=>p.id===part.id);for(const k of ['lidAdjust','closedSvgText','closedSource']){if(value[k]!==undefined)part[k]=structuredClone(value[k]);else delete part[k];}}
    if(candidate.settings.mouthTuning)project.settings.mouthTuning=structuredClone(candidate.settings.mouthTuning);else delete project.settings.mouthTuning;
    setSettings({...settings(),...motionValues(candidate.settings)});
    rebuild();await rasterReady;editor?.refresh();mouthEditor?.refresh();
  },
  async saveCandidate(candidate){return download(JSON.stringify(await portableProject(candidate)),'svg-through-motion.project.json','application/json');},
  showReview:pages=>assistPanel?.showReview(pages),updated:(state,operation)=>{rememberAssist(state);assistPanel?.updated(state);motionAssistResult?.update(state,operation);}
});
outputs=installStudioOutputs({
  request,
  previewBackground(color){document.documentElement.style.setProperty('--runtime-preview-background',color==='transparent'?'repeating-conic-gradient(#e6eaf1 0% 25%,#f6f7fa 0% 50%) 50%/22px 22px':color);},
  ttsConfig:()=>ttsUI.snapshot(),gain:()=>+$('gain').value,stopSpeech:stopVoice,
  async runtimeSnapshot(){needProject();await ensureSeamRig(project);return portableProject();},
  previewControl(){if(inShapeEditor())workspaceUI.show('motion');},
  async snapshot(){needProject();await rasterReady;await ensureSeamRig(project);const copy=structuredClone(project);copy.settings=settings();return copy;},
  state:()=>({project:project?{id:project.id,name:project.name,width:project.width,height:project.height,parts:project.parts.length}:null,
    time,playing,recording,speaking:speechActive||!$('audio').paused,settings:settings()}),
  unlockAudio:ensureAudio,
  setRecording:value=>{if(value){materialsWasPlaying=playing;playing=false;}else playing=materialsWasPlaying;recording=value;materialsRendering=value;},
  download,
  stop(){stopVoice();playing=false;manualVowel=null;mouthPreview=null;heldEye='';editor?.resetHold();$('mouth').value=0;},
  async command(cmd){
    if(savingProject)throw Error('プロジェクトを保存しています。完了後に操作してください');
    if(cmd.action==='assist')return assistCommand(cmd.assist);
    if(cmd.action==='load'){
      stopVoice();
      const url=cmd.source==='saved'?`/api/exports/${cmd.project_id}/svg-through-motion.project.json`:`/api/projects/${cmd.project_id}`;
      adoptProject(await (await request(url)).json(),{saved:cmd.source==='saved'});await rasterReady;
      return {projectId:project.id,name:project.name};
    }
    needProject();
    if(cmd.action==='play'){if(inShapeEditor())workspaceUI.show('motion');playing=true;return {playing};}
    if(cmd.action==='pause'){playing=false;return {playing};}
    if(cmd.action==='seek'){if(inShapeEditor())workspaceUI.show('motion');time=cmd.time%settings().duration;playing=false;return {time,playing};}
    if(cmd.action==='settings'){
      saveGuard?.touch();
      for(const [key,value] of Object.entries(cmd.settings)){
        const input=$(key);if(!input)throw Error('未対応の設定です: '+key);
        if(input.type==='checkbox')input.checked=value;else input.value=value;
      }
      updateSettings();rebuild();return {settings:settings()};
    }
    if(cmd.action==='speak'){
      if(inShapeEditor())workspaceUI.show('voice');
      const engine=$('engine').value;
      $('speechText').value=cmd.text;$('speechReading').value=cmd.reading||'';
      const generation=voiceGeneration+1;await speak();
      if(voiceGeneration!==generation)throw new DOMException('発話を中断しました','AbortError');
      if(engine==='browser')return {spoken:true,engine};
      const started=performance.now();
      while(!$('audio').paused&&voiceGeneration===generation){
        if(performance.now()-started>300000){stopVoice();throw Error('音声再生がタイムアウトしました');}
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      if(voiceGeneration!==generation||!$('audio').ended)throw new DOMException('発話を中断しました','AbortError');
      return {spoken:true,duration:$('audio').duration};
    }
    if(cmd.action==='export'){
      if(cmd.format==='project')return download(JSON.stringify(await portableProject()),'svg-through-motion.project.json','application/json');
      if(cmd.format==='svg')throw Error('SVGの書き出しは終了しました。素材出力か外部連携出力を使ってください。');
      const pose=currentPose();await rasterReady;
      const copy=structuredClone(project);copy.settings={...settings(),background:'transparent'};
      const plan=exportPlan(copy,{...cmd,duration:1,fps:1});
      const renderer=await prepareCanvasRenderer(copy,plan.maxEdge);
      try{renderer.draw(pose);return await download(await pngBlob(renderer.canvas),'svg-through-frame.png');}
      finally{renderer.dispose();}
    }
    throw Error('未対応の操作です');
  }
});
assistPanel=installAssistPanel(cmd=>assistCommand(cmd),()=>outputs.connectForAssist(),state=>safe(()=>requestShapeAssist(state?.workflow?.mode==='from_inputs'?'motion':state?.workflow?.targets?.some(id=>state.parts.find(p=>p.id===id)?.role==='mouth')?'mouth':'eyes',state?.workflow))());
const showAssistResults=step=>safe(async()=>{
  const sid=assistSessionFor(step);
  if(sid){const current=(await assistCommand({operation:'inspect'})).session;
    if(current?.session_id!==sid){
      if(current?.active)throw Error('別の部位をAIが補正中です。完了してから確認してください。');
      await assistCommand({operation:'resume',session_id:sid});
    }
  }
  workspaceUI.show('edit');assistPanel.open();
})();
const requestShapeAssist=installShapeAssist({snapshot:correctionSnapshot,execute:assistCommand,connect:()=>outputs.connectForAssist(),showResults:showAssistResults});
motionAssistResult=installMotionAssistResult({execute:assistCommand,retry:previous=>safe(()=>requestShapeAssist('motion',previous))(),projectId:()=>project?.id,showMotion(){workspaceUI.show('motion');time=0;playing=true;}});

workspaceUI=installWorkspaceUI({project:()=>project,closeMouth:()=>mouthEditor?.close(),
 finishProject:safe(async()=>{const button=$('projectFinish'),message=$('projectFinishStatus');button.disabled=true;message.hidden=false;message.textContent='保存しています…';try{const saved=await saveProject();returnToMenu(saved);}catch(error){message.textContent='保存できませんでした。もう一度お試しください。';throw error;}finally{button.disabled=false;}}),
 beginShapeEdit:step=>(step==='eyes'?editor:mouthEditor)?.beginEdit(),cancelShapeEdit:step=>(step==='eyes'?editor:mouthEditor)?.cancelEdit(),
 requestAssist:step=>safe(()=>requestShapeAssist(step))(),
 showAssistResults,assistSessionFor,refreshAssist:refreshAssistHistory,
  task(name,previous){
  const nextLive=name==='live';if(livePreview!==nextLive){livePreview=nextLive;if(project)rebuild();}
  if(name==='edit'){
   if(previous!=='edit')resumeAfterEdit=playing;playing=false;staticFrameKey='';view='motion';updateView();
  }else if(previous==='edit'){
   // Manual shape inspection must not pin the mouth open in motion/voice/output.
   mouthPreview=null;manualVowel=null;testBlinkUntil=0;editor?.resetHold();
   $('mouth').value=0;$('mouthOut').value='0%';
   playing=resumeAfterEdit;staticFrameKey='';workArea.reset();
  }
 },
 step(page){
  if(!project)return;playing=false;staticFrameKey='';workArea.apply();
  $('editEyeClosure').value=0;$('eyeClosureOut').value='0%';
  $('mouth').value=1;$('mouthOut').value='100%';
  if(page==='mouth'){ $('mouthShape').value='closed';mouthEditor.open(); }
  if(page==='eyes')workArea.focus(project,{x:project.rig?.faceX??project.width/2,y:project.rig?.faceY??project.height*.4});
 }
});

saveGuard=installSaveGuard({state:editableState,save:saveProject,enabled:()=>!!project&&document.body.dataset.workspaceMode!=='live'});

for(const [mount,input,value] of [['edit-eyes','editEyeClosure',EDIT_EYE_BLEND],['edit-mouth','mouth',EDIT_MOUTH_BLEND]]){
 const button=document.createElement('button');button.className='blend-reset';button.id=input+'Blend';button.textContent='開いた形と重ねて調整';
 $(input).closest('.slider-label').after(button);button.hidden=true;button.onclick=()=>{$(input).value=value;$(input).dispatchEvent(new Event('input',{bubbles:true}));};
}

