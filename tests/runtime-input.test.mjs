import test from 'node:test';
import assert from 'node:assert/strict';
import {createOutputReceiver,outputChannel,outputBackground} from '../web/runtime-input.js';
const pause=()=>new Promise(r=>setTimeout(r,30));
test('mouth input expires, stays isolated to one output, and clamps values',async()=>{
 const id=crypto.randomUUID();let now=0,color;
 const receiver=createOutputReceiver(id,{now:()=>now,onBackground:v=>color=v}),sender=outputChannel(id),other=outputChannel(id+'other');
 try{
  sender.postMessage({type:'microphone',mouth:.8});await pause();assert.equal(receiver.mouth(),.8);
  other.postMessage({type:'microphone',mouth:0});await pause();assert.equal(receiver.mouth(),.8);
  now=1600;assert.equal(receiver.mouth(),0);
  sender.postMessage({type:'microphone',mouth:9});await pause();assert.equal(receiver.mouth(),1);
  sender.postMessage({type:'microphone',mouth:'bad'});await pause();assert.equal(receiver.mouth(),1);
  sender.postMessage({type:'background',value:'#123456'});await pause();assert.equal(color,'#123456');
  assert.equal(outputBackground('url(https://invalid)'), '#00ff00');
  sender.postMessage({type:'camera',pose:{blinkL:.6,blinkR:.1,mouth:.4}});await pause();assert.deepEqual(receiver.camera(),{blinkL:.6,blinkR:.1,mouth:.4});
  now+=1600;assert.equal(receiver.camera(),null);
  sender.postMessage({type:'camera',pose:{blinkL:.2,blinkR:.4,mouth:.6}});await pause();
  sender.postMessage({type:'camera',enabled:false});await pause();assert.equal(receiver.camera(),null);
 }finally{sender.close();other.close();receiver.close();receiver.close();}
});
