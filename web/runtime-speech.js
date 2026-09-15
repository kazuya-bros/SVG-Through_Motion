// Preserve every character while respecting each TTS engine's 200-character limit.
export function speechChunks(text,limit=200){
 const chunks=[];let rest=text.trim();
 while(rest){let end=Math.min(limit,rest.length);if(rest.length>limit){const head=rest.slice(0,limit),match=[...head.matchAll(/[。！？!?\n]/g)].pop();if(match&&match.index>=limit/3)end=match.index+1;if(end<rest.length&&/[\uD800-\uDBFF]/.test(rest[end-1]))end--;}
  chunks.push(rest.slice(0,end));rest=rest.slice(end);
 }return chunks;
}

// Tokens invalidate in-flight synthesis and playback callbacks before a replacement starts.
export class SpeechRun {
 constructor(){this.current=null;}
 start(id){this.stop();const run={id,controller:new AbortController()};this.current=run;return run;}
 valid(run){return this.current===run&&!run.controller.signal.aborted;}
 stop(){this.current?.controller.abort();this.current=null;}
}

export function playSpeechAudio(audio,signal,onstart,maxDuration=300000){return new Promise((resolve,reject)=>{
 let timer,settled=false;
 const done=error=>{if(settled)return;settled=true;clearTimeout(timer);audio.onended=audio.onerror=audio.onplaying=null;signal.removeEventListener('abort',abort);error?reject(error):resolve();};
 const abort=()=>{audio.pause();done(new DOMException('発話を中断しました','AbortError'));};
 if(signal.aborted){abort();return;}signal.addEventListener('abort',abort,{once:true});
 audio.onended=()=>done();audio.onerror=()=>done(Error('音声を再生できませんでした'));audio.onplaying=onstart;
 timer=setTimeout(()=>{audio.pause();done(Error('音声再生がタイムアウトしました'));},maxDuration);
 audio.play().catch(done);
});}
