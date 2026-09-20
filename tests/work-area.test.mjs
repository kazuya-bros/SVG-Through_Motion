import test from 'node:test';
import assert from 'node:assert/strict';
import {editingPose,zoomAt,installWorkArea} from '../web/work-area.js';
test('editing pose contains only manual face controls and never starts hair animation',()=>{
 assert.deepEqual(editingPose(.6,.4),{blinkL:.6,blinkR:.6,mouth:.4});
 assert.deepEqual(editingPose(5,-4),{blinkL:1,blinkR:1,mouth:0});
 assert.equal(Number.isFinite(editingPose().hairPhase),false);
});
test('preview drag, capture cancellation, framing restore and reset operate on the actual handlers',t=>{
 const previous=globalThis.document;t.after(()=>{globalThis.document=previous;});
 const handlers={},art={style:{},dispatchEvent(){}},original={style:{}},zoom={};let captured;
 const stage={clientWidth:800,clientHeight:600,classList:{add(){},remove(){}},
  addEventListener(name,fn){handlers[name]=fn;},setPointerCapture(id){captured=id;},getBoundingClientRect(){return {left:0,top:0,width:800,height:600};}};
 globalThis.document={getElementById:id=>({stage,artboard:art,originalImage:original,zoomValue:zoom})[id]};
 let enabled=true;const area=installWorkArea({enabled:()=>enabled});
 const event=(x,y)=>({clientX:x,clientY:y,button:0,pointerId:3,target:{closest(){return null;}},preventDefault(){}});
 handlers.pointerdown(event(100,100));handlers.pointermove(event(260,160));
 assert.equal(captured,3);assert.deepEqual(area.snapshot(),{scale:1,x:.2,y:.1});
 assert.equal(art.style.transform,'translate(160px,60px) scale(1)');
 handlers.pointercancel();handlers.pointermove(event(400,400));assert.equal(area.snapshot().x,.2);
 const middle=event(200,200);middle.button=1;handlers.pointerdown(middle);const moved=event(320,260);moved.button=1;handlers.pointermove(moved);
 assert.deepEqual(area.snapshot(),{scale:1,x:.35,y:.2});handlers.pointerup(moved);
 area.restore({scale:2,x:-.1,y:.25});assert.equal(art.style.transform,'translate(-80px,150px) scale(2)');
 area.reset();assert.deepEqual(area.snapshot(),{scale:1,x:0,y:0});
 enabled=false;handlers.pointerdown(event(100,100));handlers.pointermove(event(200,200));assert.equal(area.snapshot().x,0);
});
test('wheel zoom preserves the image point under the cursor, including zoom limits',()=>{
 const initial={scale:2,x:-80,y:42},cursor={x:130,y:-52};
 for(const factor of [.01,.8,1.5,100]){
  const v=zoomAt(initial,factor,cursor);
  assert.ok(v.scale>=.25&&v.scale<=8);
  assert.ok(Math.abs((cursor.x-initial.x)/initial.scale-(cursor.x-v.x)/v.scale)<1e-8);
  assert.ok(Math.abs((cursor.y-initial.y)/initial.scale-(cursor.y-v.y)/v.scale)<1e-8);
 }
});


test('zooming either comparison pane uses that pane center and preserves synchronized framing',t=>{
 const previous=globalThis.document;t.after(()=>{globalThis.document=previous;});
 const handlers={},art={style:{},dispatchEvent(){}},original={style:{}},zoom={};
 const stage={clientWidth:800,clientHeight:600,addEventListener(name,fn){handlers[name]=fn;},getBoundingClientRect:()=>({left:0,top:0,width:800,height:600})};
 globalThis.document={getElementById:id=>({stage,artboard:art,originalImage:original,zoomValue:zoom})[id]};
 const area=installWorkArea({enabled:()=>true});
 const wheel=left=>({clientX:left+100,clientY:200,deltaY:-200,deltaMode:0,preventDefault(){},target:{closest(selector){return selector==='.preview-viewport'?{getBoundingClientRect:()=>({left,top:0,width:400,height:600})}:null;}}});
 handlers.wheel(wheel(0));const left=area.snapshot();assert.equal(art.style.transform,original.style.transform);
 area.reset();handlers.wheel(wheel(400));assert.deepEqual(area.snapshot(),left);assert.equal(art.style.transform,original.style.transform);
});
