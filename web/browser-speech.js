// Resolve at playback completion, including when invoked through the AI bridge.
export function browserSpeech(text,{signal,voice=null,onstart=()=>{},synth=globalThis.speechSynthesis,Utterance=globalThis.SpeechSynthesisUtterance,startTimeout=8000,maxDuration=300000}={}){
 return new Promise((resolve,reject)=>{
  if(!synth||!Utterance){reject(Error('ブラウザ標準の読み上げが使えません。他の音声エンジンを選んでください。'));return;}
  if(signal?.aborted){reject(new DOMException('発話を中断しました','AbortError'));return;}
  const u=new Utterance(text);u.lang='ja-JP';u.voice=voice;let settled=false,first,last;
  const finish=error=>{if(settled)return;settled=true;clearTimeout(first);clearTimeout(last);signal?.removeEventListener('abort',abort);u.onstart=u.onend=u.onerror=null;if(error){synth.cancel();reject(error);}else resolve();};
  const abort=()=>finish(new DOMException('発話を中断しました','AbortError'));
  u.onstart=()=>{clearTimeout(first);onstart();};u.onend=()=>finish();u.onerror=e=>finish(Error('ブラウザ読み上げエラー: '+e.error));
  signal?.addEventListener('abort',abort,{once:true});first=setTimeout(()=>finish(Error('ブラウザで読み上げを開始できませんでした。他の音声エンジンを選んでください。')),startTimeout);last=setTimeout(()=>finish(Error('読み上げがタイムアウトしました。')),maxDuration);
  try{synth.speak(u);}catch(e){finish(e);}
 });
}
