import test from 'node:test';
import assert from 'node:assert/strict';
import {brushSteps} from '../web/material-brush.js';
test('fast pointer movement leaves continuous brush coverage with exact endpoint',()=>{
 for(const radius of [.5,5,100]){
  const points=brushSteps([10,10],[900,600],radius);
  assert.deepEqual(points.at(-1),[900,600]);let previous=[10,10];
  for(const point of points){assert.ok(Math.hypot(point[0]-previous[0],point[1]-previous[1])<=Math.max(1,radius*.2)+1e-9);previous=point;}
 }
 assert.deepEqual(brushSteps([5,5],[5,5],20),[[5,5]]);
});
