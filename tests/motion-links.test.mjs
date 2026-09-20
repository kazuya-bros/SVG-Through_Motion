import test from 'node:test';
import assert from 'node:assert/strict';
import {executeMotionLinks,validateMotionLinks,retireClothingLinks} from '../web/motion-links.js';
import {rigGroups,mesh,warpPoint,triangleMatrix,deformationBatches} from '../web/rig.js';
import {hasSecondaryMesh} from '../web/secondary-motion.js';
import {playbackScene} from '../web/character-package.js';
import {partMotion} from '../web/part-motion.js';
function fixture(){return {width:200,height:300,settings:{rigEnabled:false},parts:[
 {id:'p000',name:'服の裾',role:'static',visible:true,x:50,y:120,width:100,height:80,secondaryMotion:{enabled:true,amount:80,cycles:1,range:70}},
 {id:'p001',name:'胴体と脚',role:'static',visible:true,x:40,y:30,width:120,height:260,faceBase:true},
 {id:'p002',name:'腰巻',role:'static',visible:true,x:30,y:130,width:140,height:65}
]};}
test('old clothing and waist links retire on load without removing hem motion or hair attachment',()=>{
 const p=fixture();p.parts[1].motionLink='p000';p.parts[1].motionLinkMode='mesh';p.parts[0].waistMotion={enabled:true};
 // A chain must be resolved before any of its links are removed.
 p.parts[2].motionLink='p001';p.parts[2].motionLinkMode='mesh';
 const saved=playbackScene(p);retireClothingLinks(saved);validateMotionLinks(saved);
 assert.equal(saved.parts[0].waistMotion,undefined);assert.equal(saved.parts[1].motionLink,undefined);assert.equal(saved.parts[2].motionLink,undefined);
 assert.equal(saved.parts[0].secondaryMotion.enabled,true);
 const groups=rigGroups(saved),pose={secondaryPhase:1.3};
 assert.notDeepEqual(warpPoint(100,190,groups[0],pose),[100,190]);
 assert.deepEqual(warpPoint(100,190,groups[1],pose),[100,190]);
 assert.throws(()=>executeMotionLinks(saved,{operation:'link',source_id:'p000',part_ids:['p001']}));
});
test('rigid hair attachment follows the anchor and tilt without stretching the ornament',()=>{
 const p=fixture();p.parts[0]={...p.parts[0],name:'後ろ髪',deformGroup:'back'};
 p.settings={rigEnabled:true,independentHair:true,backHair:30,hairMethod:'wave',hairTip:2,duration:4};
 p.rig={segmented:true,headTop:10,faceX:100,faceY:65,faceWidth:70,neckX:100,neckY:110,arms:{}};
 const at={x:95,y:175};executeMotionLinks(p,{operation:'link',source_id:'p000',part_ids:['p002'],mode:'rigid',anchor:at});
 const groups=rigGroups(p),hair=groups.find(g=>g.parts[0].id==='p000'),ornament=groups.find(g=>g.parts[0].id==='p002'),pose={hairPhase:1.4,headRoll:3,bodyRoll:2,yaw:.1};
 assert.deepEqual(warpPoint(at.x,at.y,ornament,pose).map(v=>+v.toFixed(8)),warpPoint(at.x,at.y,hair,pose).map(v=>+v.toFixed(8)));
 const a=warpPoint(75,165,ornament,pose),b=warpPoint(115,185,ornament,pose);assert.ok(Math.abs(Math.hypot(a[0]-b[0],a[1]-b[1])-Math.hypot(40,20))<1e-8);
 assert.equal(mesh(ornament).length,2);
 assert.throws(()=>executeMotionLinks(p,{operation:'link',source_id:'p000',part_ids:['p001'],mode:'mesh'}));
 assert.throws(()=>executeMotionLinks(p,{operation:'link',source_id:'p000',part_ids:['p001'],mode:'rigid',anchor:{x:-1,y:90}}));
 const saved=playbackScene(p);retireClothingLinks(saved);validateMotionLinks(saved);assert.deepEqual(saved.parts[2].motionLinkAnchor,at);
});

test('hair link edits remain atomic and reject stale settings',()=>{
 const p=fixture();p.parts[0].name='後ろ髪';p.parts[0].deformGroup='back';
 const state=executeMotionLinks(p,{operation:'inspect'}),cmd={operation:'link',source_id:'p000',part_ids:['p001'],mode:'rigid'};
 assert.equal(executeMotionLinks(p,{...cmd,expected_revision:state.revision}).changed,true);
 assert.equal(executeMotionLinks(p,cmd).changed,false);
 assert.throws(()=>executeMotionLinks(p,{...cmd,anchor:{x:100,y:150},expected_revision:state.revision}));
 assert.throws(()=>executeMotionLinks(p,{...cmd,part_ids:['p001','missing']}));
 executeMotionLinks(p,{operation:'unlink',source_id:'p000',part_ids:['p001']});assert.equal(p.parts[1].motionLink,undefined);
 p.parts[1].followPart='p000';assert.throws(()=>executeMotionLinks(p,cmd));
});

test('hem keeps its batched rendering optimization with equivalent triangle maps',()=>{
 const p=fixture(),g=rigGroups(p)[0],triangles=mesh(g),pose={secondaryPhase:1.5},batches=deformationBatches(triangles,g,pose);
 assert.ok(batches.length<triangles.length/2);
 assert.deepEqual(batches.flatMap(b=>b.indices).sort((a,b)=>a-b),triangles.map((_,i)=>i));
 for(const b of batches)for(const i of b.indices){const expected=triangleMatrix(triangles[i],g,pose);for(let j=0;j<6;j++)assert.ok(Math.abs(expected[j]-b.matrix[j])<1e-7);}
});

test('explicit lightweight attachments survive loading, follow cloth, and retain local tail motion',()=>{
 const p=fixture();p.parts[2].role='tail';
 executeMotionLinks(p,{operation:'link',mode:'attachment',source_id:'p000',part_ids:['p002']});
 const saved=playbackScene(p);retireClothingLinks(saved);validateMotionLinks(saved);
 assert.equal(saved.parts[2].motionLink,'p000');
 const groups=rigGroups(saved),owner=groups.find(g=>g.parts[0].id==='p000'),tail=groups.find(g=>g.parts[0].id==='p002');
 const pose={secondaryPhase:1.3,tailAngle:12};
 assert.deepEqual(warpPoint(100,160,tail,pose),warpPoint(100,160,owner,pose));
 assert.equal(mesh(tail).length,2);assert.equal(partMotion(saved.parts[2],pose,tail).rotation,12);
 const a=warpPoint(50,180,tail,pose),b=warpPoint(90,180,tail,pose);assert.ok(Math.abs(Math.hypot(b[0]-a[0],b[1]-a[1])-40)<1e-8);
 assert.throws(()=>executeMotionLinks(saved,{operation:'link',mode:'attachment',source_id:'p002',part_ids:['p000']}));
 executeMotionLinks(saved,{operation:'unlink',mode:'attachment',source_id:'p000',part_ids:['p002']});assert.equal(saved.parts[2].motionLink,undefined);
});

test('face attachment inherits a single face transform without changing layer order',()=>{
 const p=fixture();p.settings.rigEnabled=true;p.rig={faceX:100,faceY:65,faceWidth:70,neckX:100,neckY:110,headTop:10};p.settings.rigMode='soft';
 const order=p.parts.map(v=>v.id);executeMotionLinks(p,{operation:'link',mode:'attachment',source_id:'p001',part_ids:['p002']});
 const groups=rigGroups(p),owner=groups.find(g=>g.parts[0].id==='p001'),child=groups.find(g=>g.parts[0].id==='p002'),pose={yaw:.7,pitch:.4,headRoll:4};
 assert.deepEqual(warpPoint(100,160,child,pose),warpPoint(100,160,owner,pose));
 assert.deepEqual(p.parts.map(v=>v.id),order);
});


test('material attachment can be replaced or removed through the same dropdown command',()=>{
 const p=fixture();p.parts[2].followPart='p001';
 executeMotionLinks(p,{operation:'link',mode:'attachment',source_id:'p000',part_ids:['p002'],expected:{p002:'p001'}});
 assert.equal(p.parts[2].followPart,undefined);assert.equal(p.parts[2].motionLink,'p000');
 executeMotionLinks(p,{operation:'unlink',mode:'attachment',source_id:'p000',part_ids:['p002']});
 p.parts[2].followPart='p001';executeMotionLinks(p,{operation:'unlink',mode:'attachment',source_id:'p001',part_ids:['p002']});
 assert.equal(p.parts[2].followPart,undefined);
});
