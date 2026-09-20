import test from 'node:test';
import assert from 'node:assert/strict';
import {padMesh,paddedViewport,canvasPoint} from '../web/render-viewport.js';
test('drawing margin does not move source coordinates or modify the existing mesh',()=>{
 const project={width:100,height:200},mesh=[[[0,0],[100,0],[0,200]],[[100,0],[100,200],[0,200]]];
 const copy=structuredClone(mesh),expanded=padMesh(mesh,project,20);
 assert.equal(padMesh(mesh,project,0),mesh);assert.deepEqual(mesh,copy);assert.deepEqual(expanded.slice(0,2),mesh);
 assert(expanded.some(t=>t.some(([x,y])=>x===-20&&y===-20)));
 assert(expanded.every(([a,b,c])=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])>0));
 const canvas={viewport:paddedViewport(project,20)};
 assert.deepEqual(canvasPoint(canvas,project,20/140,20/240),[0,0]);
 assert.deepEqual(canvasPoint(canvas,project,120/140,220/240),[100,200]);
});
