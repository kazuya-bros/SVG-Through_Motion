import {MicrophoneMouth} from './microphone-mouth.js';

export function microphoneError(error){
 const messages={
  NotAllowedError:'マイクが許可されていません。ブラウザのサイト設定でマイクを許可して、もう一度お試しください。',
  NotFoundError:'マイクが見つかりません。入力機器を接続してください。',
  NotReadableError:'マイクを開けません。他のアプリで使用していないか確認してください。',
  OverconstrainedError:'選択したマイクが見つかりません。一覧を更新して選び直してください。',
  NotSupportedError:'このブラウザではマイクを利用できません。この出力のURLをChrome／Edgeで開いてください。'
 };
 return messages[error.name]||(/not supported/i.test(error.message||'')?messages.NotSupportedError:error.message)||'マイクに接続できませんでした。';
}

// getUserMedia may never settle when permission is left unanswered. Cancellation
// releases any stream that arrives later and never lets it replace a newer run.
export function waitForMedia(promise,signal,timeout=15000,dispose=()=>{}){
 return new Promise((resolve,reject)=>{
  let settled=false;
  const finish=(fn,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal.removeEventListener('abort',abort);fn(value);};
  const abort=()=>finish(reject,new DOMException('中断しました','AbortError'));
  const timer=setTimeout(()=>finish(reject,Error('マイクの応答がありません。ブラウザのマイク許可と入力機器を確認して、再度開始してください。')),timeout);
  signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
  Promise.resolve(promise).then(value=>{if(settled)dispose(value);else finish(resolve,value);},error=>finish(reject,error));
 });
}

export function createMicrophoneCapture({onState=()=>{},onLevel=()=>{},gate=()=>.01,media=navigator.mediaDevices,Context=globalThis.AudioContext,timeout=15000}={}){
 let run=null,level=0;
 function stop(){
  const old=run;run=null;level=0;
  if(old){old.abort.abort();clearInterval(old.timer);old.stream?.getTracks().forEach(t=>t.stop());void old.context?.close().catch(()=>{});}
  onLevel(0);onState('stopped','マイク停止');
 }
 async function start(device=''){
  if(run)return;const current={abort:new AbortController()};run=current;
  const signal=current.abort.signal,alive=()=>run===current&&!signal.aborted;
  onState('starting','マイクの許可・接続を確認しています…「停止」で中断できます。');
  try{
   if(!media?.getUserMedia)throw Error('このブラウザではマイクを使用できません。ChromeまたはEdgeで開いてください。');
   current.context=new Context();
   const resumed=waitForMedia(current.context.resume(),signal,timeout);
   const streamReady=waitForMedia(Promise.resolve().then(()=>{signal.throwIfAborted();return media.getUserMedia({audio:{deviceId:device?{exact:device}:undefined,echoCancellation:true,noiseSuppression:true,autoGainControl:false},video:false});}),signal,timeout,stream=>stream.getTracks().forEach(t=>t.stop())).then(stream=>{if(!alive())stream.getTracks().forEach(t=>t.stop());else current.stream=stream;return stream;});
   await Promise.all([resumed,streamReady]);if(!alive())return;
   const analyser=current.context.createAnalyser();analyser.fftSize=1024;
   const samples=new Float32Array(1024),mouth=new MicrophoneMouth();
   current.context.createMediaStreamSource(current.stream).connect(analyser);
   current.stream.getAudioTracks()[0].onended=()=>{if(alive())stop();};
   current.context.onstatechange=()=>{if(alive()&&current.context.state!=='running'){stop();onState('error','マイクの音声処理が停止しました。再度開始してください。');}};
   current.timer=setInterval(()=>{analyser.getFloatTimeDomainData(samples);level=mouth.sample(samples,gate(),performance.now());onLevel(level);},50);
   onState('running','出力ウィンドウで口パク中。この画面は開いたままにしてください。');
  }catch(e){if(alive()){stop();onState('error',microphoneError(e));}}
 }
 return {start,stop,get level(){return level;},get active(){return !!run;}};
}
