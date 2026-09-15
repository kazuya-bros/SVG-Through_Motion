import {test} from 'node:test';
import assert from 'node:assert/strict';
import {speechChunks,SpeechRun,playSpeechAudio} from '../web/runtime-speech.js';
test('long replies preserve content and split at sentence boundaries',()=>{
 const text=('これは少し長い回答です。'.repeat(70)+'🙂'.repeat(80));const chunks=speechChunks(text);
 assert.equal(chunks.join(''),text);assert.ok(chunks.every(c=>c.length<=200));assert.ok(chunks.length>1);
 assert.ok(chunks.every(c=>!/[\uD800-\uDBFF]$/.test(c)));
 assert.deepEqual(speechChunks('  こんにちは。  '),['こんにちは。']);
});
test('replacement invalidates stale synthesis and stop invalidates new playback',()=>{
 const runs=new SpeechRun(),first=runs.start('first');let aborted=false;first.controller.signal.addEventListener('abort',()=>aborted=true);
 const second=runs.start('second');assert.equal(aborted,true);assert.equal(runs.valid(first),false);assert.equal(runs.valid(second),true);
 runs.stop();assert.equal(runs.valid(second),false);assert.equal(second.controller.signal.aborted,true);
});
test('late rejection from cancelled audio cannot remove replacement playback handlers',async()=>{
 let rejectOld,started=0;const audio={pause(){},play(){return new Promise((resolve,reject)=>{rejectOld=reject;});}};
 const oldController=new AbortController(),first=playSpeechAudio(audio,oldController.signal,()=>started++);
 oldController.abort();await assert.rejects(first,{name:'AbortError'});
 audio.play=()=>Promise.resolve();const next=playSpeechAudio(audio,new AbortController().signal,()=>started++);
 rejectOld(Error('late playback rejection'));await Promise.resolve();
 assert.equal(typeof audio.onplaying,'function');audio.onplaying();assert.equal(started,1);
 assert.equal(typeof audio.onended,'function');audio.onended();await next;
});
