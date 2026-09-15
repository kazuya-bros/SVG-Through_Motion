import test from 'node:test';
import assert from 'node:assert/strict';
import {secondaryKind,secondaryPoint,secondaryRigid,normalizeSecondary} from '../web/secondary-motion.js';
import {loopPose,partMotion} from '../web/motion.js';
import {rigGroups,warpPoint} from '../web/rig.js';
import {playbackScene} from '../web/character-package.js';

const part={id:'cloth',name:'bottomwear',role:'static',visible:true,independentAccessory:true,x:20,y:30,width:100,height:100,pivotX:70,pivotY:30};
const scene=p=>({width:200,height:200,parts:[p],settings:{duration:6},deformGroup:'bottomwear'});
test('cloth defaults off, fixes waist and limits motion to chosen hem range',()=>{
 const pose=loopPose(1.5,{duration:6});
 assert.deepEqual(secondaryPoint(30,130,scene(part),pose),[30,130]);
 const p={...part,secondaryMotion:{enabled:true,amount:100,range:25}};
 assert.deepEqual(secondaryPoint(70,30,scene(p),pose),[70,30]);
 assert.deepEqual(secondaryPoint(30,100,scene(p),pose),[30,100]);
 assert.ok(secondaryPoint(30,130,scene(p),pose)[0]>35);
 assert.deepEqual(warpPoint(30,130,scene(p),pose),secondaryPoint(30,130,scene(p),pose));
});
test('wings hold their root and all extra motions close the loop',()=>{
 for(const name of ['wings','neckwear','earwear','bottomwear']){
  const p={...part,name,secondaryMotion:{enabled:true,amount:100,cycles:3}},project=scene(p);
  const start=loopPose(0,{duration:6}),end=loopPose(6,{duration:6});
  assert.deepEqual(secondaryPoint(100,130,project,start),secondaryPoint(100,130,project,end));
  assert.deepEqual(partMotion(p,start,project),partMotion(p,end,project));
  assert.deepEqual(secondaryPoint(70,30,project,loopPose(1,{duration:6})),[70,30]);
 }
});
test('brows move subtly with speech only, including their overlay; ears take priority',()=>{
 const p={...part,role:'brow-l',secondaryMotion:{enabled:true,amount:100}},project=scene(p);
 assert.equal(secondaryRigid(p,{mouth:0},project).y,0);
 assert.ok(secondaryRigid(p,{mouth:1},project).y<0);
 assert.ok(Math.abs(secondaryRigid(p,{mouth:1},project).y)<=4);
 assert.equal(secondaryRigid({...part,faceOverlay:'brow-l'},{mouth:1},project).y,secondaryRigid(p,{mouth:1},project).y);
 assert.equal(secondaryRigid({...p,name:'headwear',role:'static',earMotion:true},{secondaryPhase:1},project).rotation,0);
});
test('isolated cloth cannot deform torso, and portable scene preserves its settings',()=>{
 const p={...part,secondaryMotion:{enabled:true,amount:65,range:40,cycles:2}},core={...part,id:'torso',name:'topwear',independentAccessory:false};
 const project={width:200,height:200,settings:{},parts:[core,p]};
 const groups=rigGroups(project);assert.equal(groups.length,2);assert.equal(groups[1].parts.length,1);
 assert.equal(secondaryKind(core),null);
 assert.deepEqual(playbackScene(project).parts[1].secondaryMotion,p.secondaryMotion);
 assert.deepEqual(normalizeSecondary({amount:999,cycles:-2,range:0}),{enabled:false,amount:100,cycles:1,range:10});
});
