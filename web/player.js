import {installRuntimeCharacters} from './runtime-characters.js';
import {canvasViewport} from './render-viewport.js';
import {headSettings} from './head-coordination.js';
import {prepareBroadcastCharacter} from './broadcast-character.js';
import {createBroadcastLookRenderer} from './broadcast-look-renderer.js';
import {installBroadcastLookControls} from './broadcast-look-controls.js';
import {loopPose} from './motion.js?v=mouth-editor-9';
import {SpeechEnvelope} from './speech-envelope.js';
import {browserSpeech} from './browser-speech.js';
import {speechChunks,SpeechRun,playSpeechAudio} from './runtime-speech.js';
import {outputBackground} from './runtime-input.js';
import {installPlayerControls} from './player-controls.js';
import {applyCameraPose} from './camera-motion.js';
import {installExpressionControls} from './expression-presets.js';
import {createEffectPlayback,effectFrame} from './character-effects.js';
import {createAvatarEffectsRenderer,recipeLook,recipePose} from './avatar-recipe.js';
import {installAvatarActionControls} from './avatar-action-controls.js';
import {installAvatarPreviewEdit} from './avatar-preview-edit.js';
import {stagePose} from './stage-model.js';
import {createStageRenderer} from './stage-renderer.js';
import {createStagePlayback} from './stage-playback.js';

import {inputModes,broadcastView} from './broadcast-mode.js';
import {installPlayerPreparation} from './player-preparation.js';
import {installEffectsEditorShell} from './effects-editor-shell.js';

const params=new URLSearchParams(location.search),sid=params.get('session'),display=params.has('display');
const editingEffects=document.body.dataset.page==='effects-editor';
let mode=inputModes.includes(params.get('mode'))?params.get('mode'):'idle';
const view=broadcastView(params);
const base='/api/runtime/sessions/'+encodeURIComponent(sid),$=id=>document.getElementById(id);
const runs=new SpeechRun(),envelope=new SpeechEnvelope(),audio=new Audio();
let config,renderer,ws,context,analyser,samples,audioUrl,ready=false,active=false,packet=null,received=0,closed=false;
let started=performance.now(),lastPush=0,nativeSpeaking=false;
let controls=null,expressions=null,effectRenderer=null,effectControls=null;
let stageRenderer=null,stagePlayback=null,stageControls=null,speechCaption='';
let preparation=null,lookRenderer=null,lookControls=null,previewEdit=null,lastPose={};
const effectPlayback=createEffectPlayback(message=>send({type:'effect_result',...message}));
let effectLoadVersion=0,characterVersion=0,characterId='',characterLoading='',latestStage=null,placeCharacter=()=>{},characterControls=null;
const characterCache=new Map();
const playerTime=()=>Math.max(0,(performance.now()-started)/1000);
const initialBackground=outputBackground(params.get('background')||'#00ff00');
document.documentElement.style.background=display?'transparent':initialBackground;
if(display)$('notice').hidden=true;
function notice(text,enable=false){if(display)return;$('notice').hidden=!text;$('message').textContent=text;$('enableAudio').hidden=!enable;}
function send(message){if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify(message));}
async function json(url,body,signal){const r=await fetch(url,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal});if(!r.ok){let message;try{message=(await r.json()).detail;}catch{}throw Error(message||'出力との接続を確認してください');}return r;}
function stop(){runs.stop();effectPlayback.speechEnded();stagePlayback?.speechEnded();speechCaption='';audio.pause();audio.removeAttribute('src');audio.load();envelope.reset();nativeSpeaking=false;active=false;if(audioUrl){URL.revokeObjectURL(audioUrl);audioUrl=null;}}
async function enable(){
 try{
  if(!context){context=new AudioContext();analyser=context.createAnalyser();analyser.fftSize=1024;samples=new Float32Array(1024);context.createMediaElementSource(audio).connect(analyser);analyser.connect(context.destination);
   context.onstatechange=()=>{ready=context.state==='running';send({type:'ready',ready});if(!ready){stop();if(mode==='api')notice('音声を有効にしてください',true);}};
  }
  await context.resume();ready=context.state==='running';send({type:'ready',ready});notice(ready?'':'音声を有効にしてください',!ready);
 }catch(e){ready=false;notice(e.message,true);}
}
$('enableAudio').onclick=enable;
async function speak(message){
 stop();const run=runs.start(message.id),signal=run.controller.signal;
 const state=type=>{if(runs.valid(run))send({type,id:run.id});};
 try{
  active=true;
  for(const text of speechChunks(message.text)){
   if(!runs.valid(run))return;speechCaption='';state('synthesizing');
   if(config.engine==='browser'){
    const voice=speechSynthesis.getVoices().find(v=>v.voiceURI===config.browser_voice)||null;
    await browserSpeech(text,{voice,signal,onstart(){if(runs.valid(run)){nativeSpeaking=true;speechCaption=text;state('speaking');}}});nativeSpeaking=false;
   }else{
    const response=await json(base+'/audio',{utterance_id:run.id,text},signal),blob=await response.blob();
    if(!runs.valid(run))return;
    if(audioUrl)URL.revokeObjectURL(audioUrl);audioUrl=URL.createObjectURL(blob);audio.src=audioUrl;
    await playSpeechAudio(audio,signal,()=>{speechCaption=text;state('speaking');});
   }
  }
  if(runs.valid(run)){state('finished');stop();notice('');}
 }catch(e){if(runs.valid(run)){stateError(run,e);stop();if(e.name==='NotAllowedError'){ready=false;send({type:'ready',ready});notice('音声を有効にしてください',true);}else notice(e.message);}}
}
function stateError(run,e){send({type:'error',id:run.id,error:e.message});}
async function loadCharacter(identity,requestId){
 if(editingEffects){if(requestId)send({type:'character_result',request_id:requestId,error:'キャラクターの切り替えは配信画面で行ってください'});return;}
 if(characterId===identity){if(requestId)send({type:'character_result',request_id:requestId,character_id:identity});return;}
 if(!requestId&&characterLoading===identity)return;
 const version=++characterVersion;characterLoading=identity;notice('キャラクターを準備しています…');let next,owned=false;
 try{
  next=characterCache.get(identity);
  if(!next){const project=await(await json(base+'/characters/'+encodeURIComponent(identity)+'/project')).json();project.settings={...headSettings(project.settings),background:'transparent'};
   const r=await prepareBroadcastCharacter(project,1080),l=createBroadcastLookRenderer(r.canvas),e=createAvatarEffectsRenderer(l.canvas,project),st=createStageRenderer(e.canvas,project);next={project,renderer:r,look:l,effects:e,stage:st};owned=true;}
  if(version!==characterVersion){if(owned)disposeCharacter(next);return;}
  characterCache.set(identity,next);config.project=next.project;renderer=next.renderer;lookRenderer=next.look;effectRenderer=next.effects;stageRenderer=next.stage;characterId=identity;
  ++effectLoadVersion;effectPlayback.reset();stagePlayback=createStagePlayback({renderer:stageRenderer,send,display});if(latestStage)stagePlayback.receive(latestStage);
  $('stage').replaceChildren(stageRenderer.canvas,$('previewTools'));placeCharacter();
  if(!display){expressions?.close();expressions=installExpressionControls({host:$('controls'),project:()=>config.project,shortcuts:false});$('preparationName').textContent=config.project.name||'キャラクター';}
  document.title='SVG-Through Motion — '+(config.project.name||'キャラクター')+' — '+sid.slice(0,6);
  while(characterCache.size>2){const key=[...characterCache.keys()].find(k=>k!==characterId);disposeCharacter(characterCache.get(key));characterCache.delete(key);}
  if(requestId)send({type:'character_result',request_id:requestId,character_id:identity});notice('');
 }catch(e){if(requestId)send({type:'character_result',request_id:requestId,error:e.message});notice(e.message);}finally{if(version===characterVersion)characterLoading='';}
}
function disposeCharacter(c){c.stage.dispose();c.effects.dispose();c.look.dispose();c.renderer.dispose();}
function connect(){
 if(closed)return;
 ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}${base}/socket/${display?'display':'player'}`);
 ws.onopen=()=>{if(!display){controls?.connection(true);effectControls?.connection(true);stageControls?.connection(true);lookControls?.connection(true);send({type:'ready',ready});notice('');}};
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.type==='close'&&!display){closed=true;stop();ws.close();preparation?.show(true);notice('キャラクターの接続を終了しました。左上のロゴから選び直せます。');return;}if(m.type==='speak'&&!display)void speak(m);
  if(m.type==='voice'&&!display){Object.assign(config,m);preparation?.voice(m);}
  if(m.type==='character'&&!display)void loadCharacter(m.character_id,m.request_id);
  if(m.type==='status'&&display&&m.character_id!==characterId)void loadCharacter(m.character_id);
  if(m.type==='status'&&!display){characterControls?.update(m.character_id);preparation?.status(m);if(m.voice_revision!==config.voice_revision){Object.assign(config,{engine:m.tts.engine,browser_voice:m.tts.browser_voice||'',tts:m.tts,voice_revision:m.voice_revision});preparation?.voice(config);}}
  if(m.type==='stop'&&!display){stop();send({type:'stopped',id:m.id});}
  if(m.type==='effect'&&!display){
   const version=++effectLoadVersion;
   void (async()=>{try{
    if(m.recipe)await stageRenderer.prepare({...stagePlayback.frame(Date.now()/1000).scene,appearance:m.recipe.appearance});
    if(version!==effectLoadVersion){send({type:'effect_result',request_id:m.request_id,status:'interrupted'});return;}
    effectPlayback.start(m,playerTime(),matchMedia('(prefers-reduced-motion: reduce)').matches);
   }catch(error){send({type:'effect_result',request_id:m.request_id,status:'failed',error:error.message});}})();
  }
  if(m.type==='expression'&&!display){
   ++effectLoadVersion;
   try{if(effectPlayback.cue?.preset==='bundle')effectPlayback.reset();if(!expressions)throw Error('表情の準備ができていません');expressions.command(m);if(m.request_id)send({type:'expression_result',request_id:m.request_id,expression:expressions.state});}
   catch(error){if(m.request_id)send({type:'expression_result',request_id:m.request_id,error:error.message});}
  }
  if(m.type==='pose'){if(m.character_id&&m.character_id!==characterId)void loadCharacter(m.character_id);if(m.effect?.recipe&&packet?.effect?.request_id!==m.effect.request_id)void stageRenderer.prepare({...stagePlayback.frame(Date.now()/1000).scene,appearance:m.effect.recipe.appearance}).catch(()=>{});packet=m;received=performance.now();}
  if((m.type==='stage'||m.type==='status')&&m.stage){latestStage=m.stage;stagePlayback?.receive(m.stage);}
  if(m.type==='stage_capture'&&!display&&stageRenderer){void stageRenderer.snapshot().then(async blob=>{const form=new FormData();form.append('file',blob,'preview.png');const response=await fetch('/api/stage/sessions/'+sid+'/preview/'+m.id,{method:'POST',body:form});if(!response.ok)throw Error('確認画像を送信できませんでした');}).catch(e=>stageControls?.error(e.message));}
  if(m.type==='status'&&display){active=m.connected;if(!active)packet=null;}
 };
 ws.onclose=e=>{expressions?.command({action:'release_all'});controls?.connection(false);effectControls?.connection(false);stageControls?.connection(false);lookControls?.connection(false);stop();effectPlayback.reset();stagePlayback?.reset();packet=null;active=false;if(closed)return;if(e.code===1008){closed=true;notice(e.reason||'出力を開き直してください');return;}notice('再接続しています…');setTimeout(connect,1500);};
 ws.onerror=()=>ws.close();
}
function frame(now){
 if(renderer&&(!display||!packet?.character_id||packet.character_id===characterId)){
  const time=(now-started)/1000;
  const stageTime=Date.now()/1000,stage=stagePlayback.frame(stageTime);
  const cue=display?packet?.effect:effectPlayback.cue,effectTime=display?(packet?.time??0)+Math.max(0,now-received)/1000:time,recipeFrame=effectFrame(cue,effectTime);
  let appearance=recipeLook(stage.scene.appearance,recipeFrame);
  let pose=loopPose(time,{...config.project.settings,talking:false,singleBounce:false});pose.mouth=0;delete pose.vowelWeights;
  const cameraPose=!display?controls?.cameraPose:null;pose=applyCameraPose(pose,cameraPose,config.project.settings);
  if(display){if(active&&packet&&now-received<1500)pose={...pose,...packet.pose};}
  else if(nativeSpeaking)pose.mouth=envelope.step(.45+.3*Math.sin(time*18),now);
  else if(!audio.paused&&analyser){analyser.getFloatTimeDomainData(samples);pose.mouth=envelope.sample(samples,config.gain,now);}
  else pose.mouth=active?envelope.step(0,now):(controls?.microphoneActive?controls.mouth:cameraPose?.mouth||0);
  if(!display){if(recipeFrame.preset!=='bundle')pose=expressions?.apply(pose)||pose;pose=recipePose(stagePose(pose,stage.scene),config.project,recipeFrame);}
  if(previewEdit?.neutral){pose={sway:0,breathe:0,blinkL:0,blinkR:0,mouth:0};appearance={...appearance,...lookControls.getLook(),emotion_layers:[previewEdit.kind]};}lastPose=pose;
  renderer.draw(pose,appearance);
  lookRenderer.draw(appearance,stageRenderer.image(appearance?.light_asset_id));
  try{
   const override=stage.scene.effect==='none'?null:{preset:stage.scene.effect,strength:stage.scene.effect_strength,envelope:1,elapsed:stage.elapsed||stageTime,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches};
   effectRenderer.draw(previewEdit?.neutral?null:cue,effectTime,pose,previewEdit?.neutral?null:override);
   stageRenderer.draw({...stage.scene,appearance,caption:{...stage.scene.caption,enabled:false}},stageTime,pose,display?(packet?.caption||''):speechCaption);
   if(renderer.ready)stagePlayback.rendered(stage);else stagePlayback.deferStart(stageTime);
   if(renderer.error&&stagePlayback.state.active&&!display)send({type:'stage_result',request_id:stagePlayback.state.active.request_id,status:'failed',error:renderer.error});
   if(!display){effectPlayback.rendered(time);effectControls?.update(effectPlayback.cue,time);}
  }catch(error){
   if(!display){send({type:'effect_result',request_id:cue?.request_id,status:'failed',error:error.message});effectPlayback.reset();notice('演出を停止しました: '+error.message);}
   effectRenderer.draw(null,time,pose);
   stageRenderer.clear();
   if(stagePlayback.state.active&&!display)send({type:'stage_result',request_id:stagePlayback.state.active.request_id,status:'failed',error:error.message});
  }
  if(display&&(!active||!packet||now-received>=1500))stageRenderer.clear();
  if(!display&&now-lastPush>50){send({type:'pose',character_id:characterId,pose,time,effect:effectPlayback.cue,caption:speechCaption});lastPush=now;}
 }
 previewEdit?.refresh();requestAnimationFrame(frame);
}
const heartbeat=setInterval(()=>send({type:'heartbeat',expression:expressions?.state}),2000);
window.addEventListener('pagehide',()=>{closed=true;clearInterval(heartbeat);controls?.close();effectControls?.close();stageControls?.close();lookControls?.close();previewEdit?.close();stop();effectPlayback.reset();ws?.close();stageRenderer?.dispose();effectRenderer?.dispose();lookRenderer?.dispose();renderer?.dispose();for(const item of characterCache.values())disposeCharacter(item);characterCache.clear();characterControls?.close();void context?.close();});
try{
 config=await (await json(base+'/project')).json();characterId=config.character_id||config.project.id;config.project.settings={...headSettings(config.project.settings),background:'transparent'};
 document.title='SVG-Through Motion — '+(config.project.name||'キャラクター出力')+' — '+sid.slice(0,6);
 renderer=await prepareBroadcastCharacter(config.project,1080,text=>lookControls?.status(text));lookRenderer=createBroadcastLookRenderer(renderer.canvas);effectRenderer=createAvatarEffectsRenderer(lookRenderer.canvas,config.project);stageRenderer=createStageRenderer(effectRenderer.canvas,config.project);$('stage').replaceChildren(stageRenderer.canvas,$('previewTools'),...($('effectTransport')?[$('effectTransport')]:[]));
 const place=()=>{const v=canvasViewport(stageRenderer.canvas,config.project),fit=Math.min($('stage').clientWidth/config.project.width,$('stage').clientHeight/config.project.height);Object.assign(stageRenderer.canvas.style,{width:v.width*fit+'px',height:v.height*fit+'px',maxWidth:'none',maxHeight:'none',flexShrink:'0'});stageRenderer.canvas.style.transform=`translate(${$('stage').clientWidth*view.x}px,${$('stage').clientHeight*view.y}px) scale(${view.scale})`;};
 placeCharacter=place;characterCache.set(characterId,{project:config.project,renderer,look:lookRenderer,effects:effectRenderer,stage:stageRenderer});
 const layoutObserver=new ResizeObserver(place);layoutObserver.observe($('stage'));place();window.addEventListener('pagehide',()=>layoutObserver.disconnect(),{once:true});
 if(!display&&!editingEffects){controls=installPlayerControls({mode,base,session:sid,onStatus:value=>preparation?.status(value),onModeChange(next){
  mode=next;
 }});characterControls=installRuntimeCharacters({sid});preparation=installPlayerPreparation({sid,config,view,place,onVoice:value=>Object.assign(config,value),enableAudio:enable});}
 if(!display)expressions=installExpressionControls({host:$('controls'),project:()=>config.project,shortcuts:false});
 if(editingEffects){previewEdit=installAvatarPreviewEdit({stage:$('stage'),canvas:stageRenderer.canvas,project:config.project,pick:(x,y)=>renderer.pick(x,y,lastPose)});lookControls=installBroadcastLookControls({host:$('avatarEditor'),sid,project:config.project,placeEmotion:(...args)=>previewEdit.placeEmotion(...args)});}

 if(editingEffects){effectControls=installAvatarActionControls({host:$('avatarEditor'),sid,project:config.project,lookControls});installEffectsEditorShell({project:config.project,view,place,editor:effectControls});}
 stagePlayback=createStagePlayback({renderer:stageRenderer,send,display,changed:s=>{stageControls?.update(s);lookControls?.update(s)},error:e=>stageControls?.error(e)});
 connect();requestAnimationFrame(frame);
}catch(e){notice(e.message);}
