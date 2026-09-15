import test from 'node:test';
import assert from 'node:assert/strict';
import {editingPose,zoomAt} from '../web/work-area.js';
test('editing pose contains only manual face controls and never starts hair animation',()=>{
 assert.deepEqual(editingPose(.6,.4),{blinkL:.6,blinkR:.6,mouth:.4});
 assert.deepEqual(editingPose(5,-4),{blinkL:1,blinkR:1,mouth:0});
 assert.equal(Number.isFinite(editingPose().hairPhase),false);
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
