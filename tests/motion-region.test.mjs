import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeRegion,paintRegion,regionWeight} from '../web/motion-region.js';
import {chestPoint} from '../web/chest-motion.js';
import {secondaryPoint,normalizeSecondary} from '../web/secondary-motion.js';
import {validateMotion} from '../web/assist-motion.js';
import {rigGroups,mesh} from '../web/rig.js';
import {partLabel} from '../web/part-label.js';
const region=()=>({cx:.5,cy:.5,rx:.25,ry:.25,mask:Array(4096).fill(0)});
test('brush interpolates strokes, erases weights and rejects malformed persisted data',()=>{
 const r=region();paintRegion(r,.5,.5,.1);assert.ok(regionWeight(r,.5,.5)>.95);assert.equal(regionWeight(r,.1,.1),0);
 paintRegion(r,.5,.5,.08,true);assert.ok(regionWeight(r,.5,.5)<.05);
 assert.deepEqual(normalizeRegion(JSON.parse(JSON.stringify(r))),r);
 assert.equal(normalizeRegion({...r,mask:[255]}),null);assert.equal(normalizeRegion({...r,rx:-1}),null);
 assert.throws(()=>validateMotion({chestMotionRegion:{...r,mask:[255]}}));assert.doesNotThrow(()=>validateMotion({chestMotionRegion:r}));
});
test('chest and cloth use painted weights with zero displacement outside the brush',()=>{
 const r=region();paintRegion(r,.5,.5,.1);
 const part={id:'body',name:'body',role:'static',visible:true,x:0,y:0,width:200,height:300};
 const p={width:200,height:300,rig:{neckX:100,neckY:80,faceWidth:80},settings:{chestRegionManual:true,chestMotionRegion:r},parts:[part]};
 assert.ok(chestPoint(100,150,p,{chestOffset:20})[1]>153);assert.deepEqual(chestPoint(50,150,p,{chestOffset:20}),[50,150]);
 part.secondaryMotion=normalizeSecondary({enabled:true,amount:100,region:r});const groups=rigGroups(p);assert.equal(groups.length,1);
 assert.ok(secondaryPoint(100,150,groups[0],{secondaryPhase:Math.PI/2})[0]>100);assert.deepEqual(secondaryPoint(50,150,groups[0],{secondaryPhase:Math.PI/2}),[50,150]);
 assert.ok(mesh(groups[0]).length>1000);assert.deepEqual(normalizeSecondary(JSON.parse(JSON.stringify(part.secondaryMotion))).region,r);
});
test('layer display labels keep source identity without PSD prefix',()=>{
 assert.equal(partLabel({name:'PSDの眼鏡（eyewear）'}),'眼鏡（eyewear）');assert.equal(partLabel({name:'eyelash-l'}),'左の睫毛（eyelash-l）');assert.equal(partLabel({name:'PSDの前髪'}),'前髪（front hair）');
});

test('maximum sway preserves ordering across sharp brush edges',()=>{
 const r=region();paintRegion(r,.5,.5,.04);
 const part={id:'cloth',name:'bottomwear',role:'static',visible:true,x:0,y:0,width:1280,height:1280,secondaryMotion:{enabled:true,amount:100,region:r}};
 const p={width:1280,height:1280,parts:[part],settings:{},rig:{}};
 for(const phase of [Math.PI/2,-Math.PI/2]){let last=-Infinity;for(let x=0;x<1280;x+=2){const nx=secondaryPoint(x,640,p,{secondaryPhase:phase})[0];assert.ok(nx>last);last=nx;}}
});
