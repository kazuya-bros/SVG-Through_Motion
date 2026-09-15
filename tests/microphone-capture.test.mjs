import test from 'node:test';
import assert from 'node:assert/strict';
import {createMicrophoneCapture} from '../web/microphone-capture.js';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function stream(){const track={stopped:false,stop(){this.stopped=true;}};return {track,getTracks:()=>[track],getAudioTracks:()=>[track]};}
function context(resume=()=>Promise.resolve()){
 const instances=[];
 class Context{constructor(){this.state='running';instances.push(this);}resume(){return resume();}async close(){this.state='closed';}createAnalyser(){return {getFloatTimeDomainData(samples){samples.fill(.15);}};}createMediaStreamSource(){return {connect(){}};}}
 return {Context,instances};
}
test('pending permission can be cancelled, retried, and its late stream is stopped',async()=>{
 const first=deferred(),old=stream(),next=stream(),states=[],{Context,instances}=context();let calls=0;
 const mic=createMicrophoneCapture({media:{getUserMedia:()=>++calls===1?first.promise:Promise.resolve(next)},Context,onState:s=>states.push(s)});
 const pending=mic.start();await pause(0);mic.stop();await pending;
 await mic.start();assert.equal(states.at(-1),'running');first.resolve(old);await pause(0);
 assert.equal(old.track.stopped,true);assert.equal(next.track.stopped,false);assert.equal(instances[0].state,'closed');
 mic.stop();assert.equal(next.track.stopped,true);
});
test('permission timeout releases a later stream and permits retry',async()=>{
 const pending=deferred(),late=stream(),{Context}=context(),states=[];
 const mic=createMicrophoneCapture({media:{getUserMedia:()=>pending.promise},Context,timeout:15,onState:s=>states.push(s)});
 await mic.start();assert.equal(mic.active,false);assert.equal(states.at(-1),'error');pending.resolve(late);await pause(0);assert.equal(late.track.stopped,true);
});
test('suspended audio timeout releases the acquired microphone',async()=>{
 const captured=stream(),{Context}=context(()=>new Promise(()=>{}));
 const mic=createMicrophoneCapture({media:{getUserMedia:async()=>captured},Context,timeout:15});await mic.start();
 assert.equal(mic.active,false);assert.equal(captured.track.stopped,true);
});
test('denied permission closes audio context and reports an actionable message',async()=>{
 const {Context,instances}=context(),states=[];
 const mic=createMicrophoneCapture({media:{getUserMedia:async()=>{throw new DOMException('denied','NotAllowedError');}},Context,onState:(...s)=>states.push(s)});
 await mic.start();assert.equal(instances[0].state,'closed');assert.match(states.at(-1)[1],/許可/);assert.equal(mic.active,false);
});
test('sampling runs independently of preview frames, and stops after disconnect',async()=>{
 const captured=stream(),{Context}=context(),levels=[];
 const mic=createMicrophoneCapture({media:{getUserMedia:async()=>captured},Context,onLevel:v=>levels.push(v)});
 await mic.start();await pause(110);assert.ok(levels.some(v=>v>0));captured.track.onended();assert.equal(levels.at(-1),0);assert.equal(mic.active,false);
 const count=levels.length;await pause(60);assert.equal(levels.length,count);
});
