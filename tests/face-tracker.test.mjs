import test from 'node:test';
import assert from 'node:assert/strict';
import {FaceTracker,cameraWait} from '../web/face-tracker.js';
class WorkerStub{
  messages=[];terminated=false;
  postMessage(message){this.messages.push(message);}
  terminate(){this.terminated=true;}
  reply(result){this.onmessage({data:{id:this.messages.at(-1).id,result}});}
}
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
test('model initialization can be cancelled and late responses are ignored',async()=>{
  const worker=new WorkerStub(),tracker=new FaceTracker({worker,makeBitmap:()=>{}});
  const promise=tracker.init();tracker.close();await assert.rejects(promise,{name:'AbortError'});
  worker.reply(true);assert.equal(worker.terminated,true);assert.equal(tracker.pending.size,0);
});
test('hung model and inference terminate their worker',async()=>{
  for(const type of ['init','detect']){
    const worker=new WorkerStub(),tracker=new FaceTracker({worker,makeBitmap:()=>{},initTimeout:5,frameTimeout:5});
    await assert.rejects(type==='init'?tracker.init():tracker.request('detect'),/時間切れ|応答/);
    assert.equal(worker.terminated,true);
  }
});
test('only one frame is in flight and bitmaps are released',async()=>{
  let closed=0;const worker=new WorkerStub(),tracker=new FaceTracker({worker,makeBitmap:async()=>({close(){closed++;}})});
  const first=tracker.detect({},100);assert.equal(await tracker.detect({},101),null);
  await tick();worker.reply({faceBlendshapes:[]});assert.deepEqual(await first,{faceBlendshapes:[]});
  assert.equal(closed,1);assert.equal(tracker.busy,false);tracker.close();
});
test('cancellation during bitmap creation discards the frame',async()=>{
  let deliver,closed=0;const worker=new WorkerStub(),tracker=new FaceTracker({worker,makeBitmap:()=>new Promise(r=>deliver=r)});
  const result=tracker.detect({},100);tracker.close();deliver({close(){closed++;}});
  assert.equal(await result,null);assert.equal(closed,1);assert.equal(worker.messages.length,0);
});
test('camera permission timeout or cancellation releases a late stream',async()=>{
  for(const cancel of [false,true]){
    let deliver,released=0;const controller=new AbortController();
    const result=cameraWait(new Promise(r=>deliver=r),{signal:controller.signal,timeout:5,dispose(){released++;}});
    if(cancel)controller.abort();await assert.rejects(result);
    deliver({});await tick();assert.equal(released,1);
  }
});
test('worker errors reject pending requests and allow a new instance',async()=>{
  const worker=new WorkerStub(),tracker=new FaceTracker({worker,makeBitmap:()=>{}}),result=tracker.init();
  worker.onerror({message:'WASM failed'});await assert.rejects(result,/WASM failed/);
  const nextWorker=new WorkerStub(),next=new FaceTracker({worker:nextWorker,makeBitmap:()=>{}}),ready=next.init();nextWorker.reply(true);assert.equal(await ready,true);next.close();
});
