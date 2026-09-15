import {createLiveBridge} from './live-bridge.js';
import {exportMaterials} from './material-export.js';
import {exportGameCharacter,GAME_TARGETS} from './game-export.js';
import {installRuntimeLauncher} from './runtime-launcher.js';
import {exportCharacterPackage} from './character-package.js';
import {exportMpng} from './mpng-export.js';
import {exportPngParts} from './parts-export.js';
import {exportProgress} from './export-progress.js';


export function installStudioOutputs(api) {
  const section=document.createElement('section');section.className='control-card';section.id='liveOutputs';
  section.innerHTML=`<details id="editorOutputDetails"><summary>編集画面の動きをそのまま送る（マイク・カメラ）</summary>
    <p class="tiny">この画面を開いたまま使います。OBSにはキャラクターだけを透過表示します。</p>
    <div class="row"><button id="liveConnect" class="primary wide">AI・OBS接続を開始</button><button id="liveDisconnect">切断</button></div>
    <button id="livePublish" class="wide">編集内容をOBSへ反映</button>
    <p id="liveStatus" class="note" role="status">未接続</p>
    <label>OBSブラウザソースのURL<input id="obsUrl" readonly></label>
    <div class="row"><button id="copyObs" class="wide">URLをコピー</button><a id="openObs" target="_blank" rel="noopener">表示を確認 ↗</a></div>
    <p class="tiny">OBSで「ブラウザ」ソースを追加し、上のURLを指定。編集後は「反映」を押してください。音声はこのアプリのブラウザから出ます。OBSでその音声またはマイクを別途取り込んでください。</p>
    </details>
    <details id="editorControlDetails"><summary>編集用APIから操作する</summary><p class="tiny">接続開始後、ローカルREST APIから再生・口形・動きの設定・選択した声での読み上げ・保存・素材出力を操作できます。マイクの許可は画面から行います。</p>
    <a href="/api/docs" target="_blank" rel="noopener">API仕様 ↗</a> · <a href="/web/control-help.html" target="_blank" rel="noopener">接続例と操作一覧 ↗</a></details>
    <section id="materialOutputs" class="control-card"><h3>連番・パーツ素材</h3>
    <p class="tiny">動きを透過PNGの連番・シートにします。パーツだけの出力もできます。</p>
    <div id="materialTiming" class="coordinate-row"><label>長さ（秒）<input id="materialDuration" type="number" min="1" max="30" step=".1" value="4"></label>
    <label>fps<select id="materialFps"><option>12</option><option selected>24</option><option>30</option><option>60</option></select></label></div>
    <div class="coordinate-row"><label>最大辺（px）<select id="materialEdge"><option>256</option><option selected>512</option><option>768</option><option>1024</option></select></label>
    <label id="materialColumnsLabel">シートの列数<input id="materialColumns" type="number" min="1" max="32" value="8"></label></div>
    <div id="materialGenericButtons" class="row"><button id="materialFrames" class="wide">PNG連番 ZIP</button><button id="materialSheet" class="wide">スプライトシート ZIP</button></div>
    <button id="materialParts" class="wide">PNGパーツ ZIP</button>
    <button id="materialCancel" class="wide" disabled hidden>書き出しを中断</button>
    <p id="materialStatus" class="note" role="status" hidden></p></section>
    <section id="externalOutputs" class="control-card"><h2>外部連携出力</h2>
    <section class="integration-card"><h3>SpriTalk用</h3><p>絵と動きの設定を保ち、会話に合わせて動かすための素材です。</p><p class="integration-availability">SpriTalk側の専用読み込み対応が必要です。</p><button id="exportSpritalk" class="primary wide">SpriTalk用 ZIP</button></section>
    <section class="integration-card"><h3>MPNG用</h3><p>髪・耳・胸などを動画に固定し、口だけを会話に合わせます。</p><p class="tiny">透過動画・口差分・追跡データをまとめます。顎は発話に連動しません。口に髪が重なる素材はSpriTalk用を選んでください。</p><button id="exportMpng" class="wide">MPNG用 ZIP</button></section>
    <section class="integration-card"><h3>ゲーム向け</h3><p>使うゲームツールに合わせて、立ち絵と目・口の差分を書き出します。</p>
    <label id="materialTargetLabel">使うツール<select id="materialTarget"><option value="tyrano">ティラノ</option><option value="rpgmaker">ツクールMZ</option><option value="unity">Unity</option></select></label>
    <p id="materialDescription" class="tiny"></p><label>立ち絵の最大辺（px）<select id="gameEdge"><option>256</option><option selected>512</option><option>768</option><option>1024</option></select></label>
    <button id="materialCharacter" class="wide">ティラノ用 ZIPを書き出す</button></section>
    <p id="externalStatus" class="note" role="status" hidden></p></section>`;
  document.getElementById('liveMount').append(section);
  document.getElementById('editorOutputDetails').append(document.getElementById('editorControlDetails'));
  installRuntimeLauncher(api);
  section.hidden=true;
  document.getElementById('materialsMount').append(document.getElementById('materialOutputs'));
  document.getElementById('externalMount').append(document.getElementById('externalOutputs'));
  const $=id=>document.getElementById(id),say=(id,text,error=false)=>{$(id).textContent=text;$(id).style.color=error?'#a44b35':'';if(id==='materialStatus')$(id).hidden=!text;};
  const run=fn=>async()=>{try{await fn();}catch(e){say('liveStatus',e.message,true);}};
  let forcedPose={},exportAbort=null;
  const bridge=createLiveBridge({snapshot:api.snapshot,state:()=>({...api.state(),microphone:false}),
    onStatus:(text,error)=>say('liveStatus',text,error),execute});
  $('obsUrl').value=location.origin+'/web/obs.html';$('openObs').href=location.origin+'/web/obs.html?debug=1';
  $('copyObs').onclick=run(async()=>{await navigator.clipboard.writeText($('obsUrl').value);say('liveStatus','OBS用URLをコピーしました。');});
  $('liveConnect').onclick=run(async()=>{await api.unlockAudio();await api.snapshot();await bridge.connect();});
  $('liveDisconnect').onclick=()=>{bridge.disconnect();api.stop();exportAbort?.abort();forcedPose={};};
  $('livePublish').onclick=run(()=>bridge.publish());
  async function materials(options){
    if(exportAbort||api.state().recording)throw Error('別の書き出しが実行中です');
    const abort=new AbortController();exportAbort=abort;api.setRecording(true);
    const buttons=[...document.querySelectorAll('.export-grid button, [name=gamePurpose]'),$('materialFrames'),$('materialSheet'),$('materialCharacter'),$('materialTarget')];
    buttons.forEach(b=>b.disabled=true);$('materialCancel').disabled=false;$('materialCancel').hidden=false;
    try{
      say('materialStatus','素材を準備しています…');exportProgress.update('素材を準備しています…');
      const project=await api.snapshot();
      const character=!!GAME_TARGETS[options.target];
      const {blob,manifest}=await (character?exportGameCharacter:exportMaterials)(project,options,{signal:abort.signal,progress:(n,total)=>{const text=`${n} / ${total}${character?'ポーズ':'コマ'}を描画中… ${Math.round(n/total*100)}%`;say('materialStatus',text);exportProgress.update(text);}});
      abort.signal.throwIfAborted();
      const saved=await api.download(blob,character?`svg-through-${options.target}.zip`:options.format==='sheet'?'svg-through-spritesheet.zip':'svg-through-frames.zip');
      say('materialStatus',character?`${GAME_TARGETS[options.target].label}用の素材と使い方を保存しました。`:`${manifest.frameCount}コマ・${manifest.fps}fps・${manifest.duration.toFixed(2)}秒を保存しました。`);
      return {...saved,...(character?{target:options.target}: {frameCount:manifest.frameCount,fps:manifest.fps,duration:manifest.duration})};
    }catch(e){say('materialStatus',e.name==='AbortError'?'書き出しを中断しました。':e.message,true);throw e;}
    finally{exportAbort=null;api.setRecording(false);buttons.forEach(b=>b.disabled=false);$('materialCancel').disabled=true;$('materialCancel').hidden=true;}
  }
  const uiExport=(label,work)=>async()=>{
   try{await exportProgress.run(label,work,()=>{const link=$('lastExport');return link.hidden?null:{url:link.href,name:link.textContent,path:link.title};});}catch{/* The modal shows the error. */}
  };
  const exportFromUi=format=>uiExport(format==='frames'?'PNG連番':'スプライトシート',()=>materials({format,duration:+$('materialDuration').value,fps:+$('materialFps').value,max_edge:+$('materialEdge').value,columns:+$('materialColumns').value}));
  $('materialFrames').onclick=exportFromUi('frames');$('materialSheet').onclick=exportFromUi('sheet');$('materialCancel').onclick=()=>exportAbort?.abort();
  let durationEdited=false;
  $('materialDuration').addEventListener('input',()=>durationEdited=true);
  const syncDuration=()=>{if(!durationEdited&&api.state().project)$('materialDuration').value=api.state().settings.duration;};
  document.querySelector('[data-tab="export"]').addEventListener('click',syncDuration);
  document.querySelector('[data-output-page="image"]').addEventListener('click',syncDuration);
  const updateMaterialTarget=()=>{
    const target=$('materialTarget').value;
    $('materialDescription').textContent=GAME_TARGETS[target].description;
    $('materialCharacter').textContent=`${GAME_TARGETS[target].label}用 ZIPを書き出す`;
    say('materialStatus','');
  };
  $('materialTarget').onchange=updateMaterialTarget;updateMaterialTarget();
  $('materialCharacter').onclick=uiExport('ゲーム用素材',()=>materials({target:$('materialTarget').value,max_edge:+$('gameEdge').value}));
  async function integration(kind){
   if(api.state().recording||exportAbort)throw Error('別の書き出しが実行中です');
   api.setRecording(true);
   try{
    const project=await api.snapshot();
    const exporter=kind==='spritalk'?exportCharacterPackage:kind==='mpng'?exportMpng:exportPngParts;
    const {blob}=await exporter(project,{request:api.request,progress:text=>exportProgress.update(text)});
    return await api.download(blob,`svg-through-${kind}.zip`);
   }finally{api.setRecording(false);}
  }
  $('exportSpritalk').onclick=uiExport('SpriTalk用素材',()=>integration('spritalk'));
  $('exportMpng').onclick=uiExport('MPNG用素材',()=>integration('mpng'));
  $('materialParts').onclick=uiExport('PNGパーツ',()=>integration('png-parts'));
  async function execute(cmd){
    if(cmd.action==='stop'){exportAbort?.abort();forcedPose={};api.stop();return {stopped:true};}
    if(api.state().recording)throw Error('書き出し完了後に操作してください');
    if(cmd.action==='pose'){
      api.previewControl?.();
      if(cmd.reset)forcedPose={};
      for(const key of ['mouth','blinkL','blinkR','vowel'])if(cmd[key]!==undefined)forcedPose[key]=cmd[key];
      return {pose:forcedPose};
    }
    if(cmd.action==='export'&&['frames','sheet'].includes(cmd.format))return materials(cmd);
    if(cmd.action==='export'&&['spritalk','mpng','png-parts'].includes(cmd.format))return integration(cmd.format);
    const result=await api.command(cmd);
    if(['load','settings'].includes(cmd.action)){forcedPose={};await bridge.publish();}
    return result;
  }
  window.addEventListener('beforeunload',()=>{bridge.disconnect();exportAbort?.abort();});
  return {
    connectForAssist:()=>bridge.connect(!!api.state().project),
    applyPose(pose,audioActive){
      Object.assign(pose,forcedPose);if(forcedPose.vowel)delete pose.vowelWeights;
      return pose;
    },
    push:bridge.push,
    reset(){forcedPose={};},
  };
}
