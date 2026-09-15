import {installTtsUI} from './tts-ui.js';
import {outputBackground} from './runtime-input.js';
import {browserSpeech} from './browser-speech.js';
import {playSpeechAudio} from './runtime-speech.js';

export function installRuntimeLauncher(api){
 const mount=document.createElement('section');mount.id='runtimeLauncher';mount.className='control-card';
 mount.innerHTML=`<fieldset id="outputConfig"><label>音声エンジン<select id="runtimeTts-engine"></select></label><div id="runtimeTts-sbvSettings"></div><div class="runtime-voice-preview"><button id="runtimeVoicePreview">声を試す</button><button id="runtimeVoiceStop" disabled>試聴を停止</button></div><p id="runtimeVoiceStatus" class="note" role="status" hidden></p></fieldset>
 <label>背景<select id="runtimeBackground"><option value="#00ff00">クロマキー：緑</option><option value="#0000ff">クロマキー：青</option><option value="custom">クロマキー：色を選ぶ</option><option value="transparent">透過（ブラウザソース向け）</option></select></label>
 <label id="outputColorLabel" hidden>背景色<input id="outputColor" type="color" value="#ff00ff"></label>
 <div class="runtime-launch-options" aria-label="使い方を選ぶ"><button data-launch-mode="mic">マイクで動かす <span aria-hidden="true">↗</span></button><button data-launch-mode="camera">カメラで動かす <span aria-hidden="true">↗</span></button><button data-launch-mode="api">AI・外部アプリで話す <span aria-hidden="true">↗</span></button></div>
 <p class="tiny">マイク・カメラは音声エンジンなしで使えます。AIから話す場合は、開いたウィンドウで外部のAIへ接続情報を渡します。</p>
 <p id="outputStatus" class="note" role="status" hidden></p>`;
 document.getElementById('liveMount').prepend(mount);
 const $=id=>document.getElementById(id),say=(text,error=false)=>{$('outputStatus').hidden=!text;$('outputStatus').textContent=text;$('outputStatus').style.color=error?'#a44b35':'';};
 const post=async(url,body,signal)=>{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});if(!r.ok){let detail;try{detail=(await r.json()).detail;}catch{}throw Error(typeof detail==='string'?detail:'出力の設定を確認してください');}return r;};
 const audio=new Audio();let preview=null,audioUrl=null,opening=false;
 const voiceStatus=(text,error=false)=>{const el=$('runtimeVoiceStatus');el.hidden=!text;el.textContent=text;el.style.color=error?'#a44b35':'';};
 const previewButtons=()=>{$('runtimeVoicePreview').disabled=opening||!!preview;$('runtimeVoiceStop').disabled=opening||!preview;};
 function stopPreview(){const run=preview;preview=null;run?.abort();audio.pause();audio.removeAttribute('src');audio.load();if(audioUrl){URL.revokeObjectURL(audioUrl);audioUrl=null;}previewButtons();if(run)voiceStatus('試聴を停止しました。');}
 const tts=installTtsUI({post,stop:stopPreview,status:voiceStatus},{prefix:'runtimeTts-',testLabel:'声を試す'});tts.restore(api.ttsConfig?.());
 document.addEventListener('projectloaded',()=>tts.restore(api.ttsConfig?.()));
 $('runtimeVoiceStop').onclick=stopPreview;
 $('runtimeTts-connectTts').addEventListener('click',stopPreview);
 $('outputConfig').addEventListener('input',stopPreview);
 $('outputConfig').addEventListener('change',stopPreview);
 window.addEventListener('pagehide',stopPreview);
 $('runtimeVoicePreview').onclick=async()=>{
  if(preview||opening)return;
  const run=new AbortController();
  try{
   const body=tts.body('こんにちは。この声でお話しします。');api.stopSpeech?.();preview=run;previewButtons();voiceStatus('試聴の音声を準備しています…');
   const started=()=>{if(preview===run)voiceStatus('試聴中です。');};
   if(body.engine==='browser')await browserSpeech(body.text,{signal:run.signal,voice:tts.browserVoice,onstart:started});
   else{
    const response=await post('/api/tts/synthesize',body,run.signal),blob=await response.blob();
    if(preview!==run||run.signal.aborted)return;
    audioUrl=URL.createObjectURL(blob);audio.src=audioUrl;
    await playSpeechAudio(audio,run.signal,started);
   }
   if(preview===run){stopPreview();voiceStatus('試聴が終わりました。');}
  }catch(e){if(run.signal.aborted)return;if(preview===run)stopPreview();voiceStatus(e.message,true);}
 };
 const background=()=>outputBackground($('runtimeBackground').value==='custom'?$('outputColor').value:$('runtimeBackground').value);
 try{const saved=localStorage.getItem('svg-through-output-background');if(saved){const value=outputBackground(saved);$('runtimeBackground').value=['transparent','#00ff00','#0000ff'].includes(value)?value:'custom';if(value!=='transparent')$('outputColor').value=value;}}catch{}
 const updateBackground=()=>{$('outputColorLabel').hidden=$('runtimeBackground').value!=='custom';api.previewBackground?.(background());try{localStorage.setItem('svg-through-output-background',background());}catch{}};
 $('runtimeBackground').onchange=updateBackground;$('outputColor').oninput=updateBackground;updateBackground();
 for(const button of mount.querySelectorAll('[data-launch-mode]'))button.onclick=async()=>{
  if(opening)return;let popup;
  try{
   const mode=button.dataset.launchMode,ttsBody=mode==='api'?tts.body(''):{engine:'browser'},color=background();
   popup=window.open('about:blank','svg-through-output-'+crypto.randomUUID(),'popup,width=900,height=760');
   if(!popup)throw Error('ポップアップを許可して、もう一度開いてください。');
   stopPreview();opening=true;mount.querySelectorAll('button').forEach(b=>b.disabled=true);say('キャラクターを準備しています…');
   const project=await(api.runtimeSnapshot||api.snapshot)();
   const result=await(await post('/api/runtime/sessions',{project,tts:ttsBody,gain:api.gain?.()||5,accepting:mode==='api'})).json();
   const url=new URL(result.player_url,location.href);url.searchParams.set('mode',mode);url.searchParams.set('background',color);
   api.stopSpeech?.();popup.location.href=url.href;
   say('開いたウィンドウで設定できます。この画面は閉じても使えます。');
  }catch(e){popup?.close();say(e.message,true);}finally{opening=false;mount.querySelectorAll('button').forEach(b=>b.disabled=false);previewButtons();}
 };
}
