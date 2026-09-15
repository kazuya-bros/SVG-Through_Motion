import test from 'node:test';
import assert from 'node:assert/strict';
import {exportPlan} from '../web/material-export.js';

const p={width:1024,height:1536,parts:Array(18).fill({}),settings:{duration:4}};
test('material frame clock has no duplicated endpoint and rounds duration to whole frames',()=>{
  const plan=exportPlan(p,{fps:24,duration:1.03,max_edge:512});
  assert.equal(plan.count,25);assert.equal(plan.duration,25/24);
  assert.equal(plan.width,341);assert.equal(plan.height,512);
  assert.ok((plan.count-1)/plan.fps<plan.duration);
});
test('sprite pages stay within 4096px and preserve a stable frame box',()=>{
  const plan=exportPlan({...p,parts:[{}]},{fps:24,duration:20,max_edge:2048,columns:32});
  assert.ok(plan.columns*plan.width<=4096);assert.ok(plan.rows*plan.height<=4096);
  assert.ok(plan.perPage<plan.count);assert.equal(plan.height,1536); // no upscale
});
test('reject unreasonable frame counts and raster memory before rendering',()=>{
  assert.throws(()=>exportPlan(p,{fps:60,duration:30}),/600/);
  assert.throws(()=>exportPlan({...p,parts:Array(30).fill({})},{max_edge:2048}),/メモリ/);
  for(const options of [{fps:0},{duration:NaN},{columns:0},{max_edge:20000}])assert.throws(()=>exportPlan(p,options));
});
