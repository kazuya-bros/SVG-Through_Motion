import {prepareCanvasRenderer} from './canvas-renderer.js?v=mouth-editor-9';
import {loopPose} from './motion.js?v=mouth-editor-9';
import {SpeechEnvelope} from './speech-envelope.js';
import {browserSpeech} from './browser-speech.js';
import {speechChunks,SpeechRun,playSpeechAudio} from './runtime-speech.js';
import {outputBackground} from './runtime-input.js';
import {installPlayerControls} from './player-controls.js';
import {applyCameraPose} from './camera-motion.js';

const params=new URLSearchParams(location.search),sid=params.get('session'),display=params.has('display');
const mode=['mic','camera','api'].includes(params.get('mode'))?params.get('mode'):'api';
const base='/api/runtime/sessions/'+encodeURIComponent(sid),$=id=>document.getElementById(id);
const runs=new SpeechRun(),envelope=new SpeechEnvelope(),audio=new Audio();
let config,renderer,ws,context,analyser,samples,audioUrl,ready=false,active=false,packet=null,received=0,closed=false;
let started=performance.now(),lastPush=0,nativeSpeaking=false;
let controls=null;
const initialBackground=outputBackground(params.get('background')||'#00ff00');
document.documentElement.style.background=display?'transparent':initialBackground;
if(display)$('notice').hidden=true;
function notice(text,enable=false){if(display)return;$('notice').hidden=!text;$('message').textContent=text;$('enableAudio').hidden=!enable;}
function send(message){if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify(message));}
async function json(url,body,signal){const r=await fetch(url,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal});if(!r.ok){let message;try{message=(await r.json()).detail;}catch{}throw Error(message||'出力との接続を確認してください');}return r;}
function stop(){runs.stop();audio.pause();audio.removeAttribute('src');audio.load();envelope.reset();nativeSpeaking=false;active=false;if(audioUrl){URL.revokeObjectURL(audioUrl);audioUrl=null;}}
async function enable(){
 try{
  if(!context){context=new AudioContext();analyser=context.createAnalyser();analyser.fftSize=1024;samples=new Float32Array(1024);context.createMediaElementSource(audio).connect(analyser);analyser.connect(context.destination);
   context.onstatechange=()=>{ready=context.state==='running';send({type:'ready',ready});if(!ready){stop();notice('音声を有効にしてください',true);}};
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
   if(!runs.valid(run))return;state('synthesizing');
   if(config.engine==='browser'){
    const voice=speechSynthesis.getVoices().find(v=>v.voiceURI===config.browser_voice)||null;
    await browserSpeech(text,{voice,signal,onstart(){if(runs.valid(run)){nativeSpeaking=true;state('speaking');}}});nativeSpeaking=false;
   }else{
    const response=await json(base+'/audio',{utterance_id:run.id,text},signal),blob=await response.blob();
    if(!runs.valid(run))return;
    if(audioUrl)URL.revokeObjectURL(audioUrl);audioUrl=URL.createObjectURL(blob);audio.src=audioUrl;
    await playSpeechAudio(audio,signal,()=>state('speaking'));
   }
  }
  if(runs.valid(run)){state('finished');stop();notice('');}
 }catch(e){if(runs.valid(run)){stateError(run,e);stop();if(e.name==='NotAllowedError'){ready=false;send({type:'ready',ready});notice('音声を有効にしてください',true);}else notice(e.message);}}
}
function stateError(run,e){send({type:'error',id:run.id,error:e.message});}
function connect(){
 if(closed)return;
 ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}${base}/socket/${display?'display':'player'}`);
 ws.onopen=()=>{if(!display){controls?.connection(true);send({type:'ready',ready});if(mode==='api')notice(ready?'':'音声を有効にしてください',!ready);}};
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.type==='close'&&!display){closed=true;stop();ws.close();notice('出力を閉じました。');window.close();return;}if(m.type==='speak'&&!display)void speak(m);
  if(m.type==='stop'&&!display){stop();send({type:'stopped',id:m.id});}
  if(m.type==='pose'){packet=m;received=performance.now();}
  if(m.type==='status'&&display){active=m.connected;if(!active)packet=null;}
 };
 ws.onclose=e=>{controls?.connection(false);stop();packet=null;active=false;if(closed)return;if(e.code===1008){closed=true;notice(e.reason||'出力を開き直してください');return;}notice('再接続しています…');setTimeout(connect,1500);};
 ws.onerror=()=>ws.close();
}
function frame(now){
 if(renderer){
  const time=(now-started)/1000;
  let pose=loopPose(time,{...config.project.settings,talking:false});pose.mouth=0;delete pose.vowelWeights;
  const cameraPose=!display?controls?.cameraPose:null;pose=applyCameraPose(pose,cameraPose,config.project.settings);
  if(display){if(active&&packet&&now-received<1500)pose={...pose,...packet.pose};}
  else if(nativeSpeaking)pose.mouth=envelope.step(.45+.3*Math.sin(time*18),now);
  else if(!audio.paused&&analyser){analyser.getFloatTimeDomainData(samples);pose.mouth=envelope.sample(samples,config.gain,now);}
  else pose.mouth=active?envelope.step(0,now):(controls?.microphoneActive?controls.mouth:cameraPose?.mouth||0);
  renderer.draw(pose);
  if(!display&&now-lastPush>50){send({type:'pose',pose,time});lastPush=now;}
 }
 requestAnimationFrame(frame);
}
const heartbeat=setInterval(()=>send({type:'heartbeat'}),2000);
window.addEventListener('pagehide',()=>{closed=true;clearInterval(heartbeat);controls?.close();stop();ws?.close();renderer?.dispose();void context?.close();});
try{
 config=await (await json(base+'/project')).json();config.project.settings={...config.project.settings,background:'transparent'};
 document.title='SVG-Through Motion — '+(config.project.name||'キャラクター出力')+' — '+sid.slice(0,6);
 renderer=await prepareCanvasRenderer(config.project,1080);$('stage').replaceChildren(renderer.canvas);
 if(!display){controls=installPlayerControls({mode,base,session:sid});if(mode==='api'){notice('音声を有効にしてください',true);void enable();}else notice('');}
 connect();requestAnimationFrame(frame);
}catch(e){notice(e.message);}
