import test from 'node:test';
import assert from 'node:assert/strict';
import {applyNeckPivot,pivotScreenPoint,pivotFromScreen} from '../web/pivot-picker.js';
import {normalizeRig,warpPoint} from '../web/rig.js';
import {loopPose} from '../web/motion.js';
import {activateMotionControl} from '../web/hair-activation.js';
const project=()=>{
 const p={width:1024,height:1024,parts:[],settings:{rigEnabled:true,independentHair:true}};
 p.rig=normalizeRig({neckX:518,neckY:529,faceX:518,faceY:373,faceWidth:305,segmented:true,arms:{'arm-r':{x:380,y:590}}},p);
 return p;
};
test('neck marker maps through animated orientation and does not mutate saved geometry',()=>{
 const p=project(),before=JSON.stringify(p),point={x:500,y:540};
 for(let t=0;t<4;t+=.11){
  const pose=loopPose(t,{duration:4,headTilt:8,headYaw:1,pitchSway:1,headNod:6,bodyFollow:.3,sway:8,breathe:15});
  const screen=pivotScreenPoint(point,p,undefined,pose),picked=pivotFromScreen(screen,p,undefined,pose);
  assert.ok(Math.hypot(picked.x-point.x,picked.y-point.y)<.01);
 }
 assert.equal(JSON.stringify(p),before);
});
test('confirming the neck point produces the previewed deformation and preserves arm pivots',()=>{
 const p=project(),point={x:495,y:550},pose={headRoll:7,yaw:1,pitch:-1,bodyRoll:2};
 const expected=warpPoint(430,300,p,{...pose,neckPivot:point}),arms=structuredClone(p.rig.arms);
 applyNeckPivot(p,point);
 assert.deepEqual(warpPoint(430,300,p,pose),expected);
 assert.deepEqual(p.rig.arms,arms);
 const loaded=JSON.parse(JSON.stringify(p));assert.equal(loaded.rig.neckX,495);assert.equal(loaded.rig.neckY,550);
});
test('visible head, arm and neck controls activate previously disabled deformation',()=>{
 for(const id of ['headYaw','headPitch','pitchSway','headTilt','headNod','bodyFollow','armSwing','neckPivotPick']){
  const s={rigEnabled:false};assert.equal(activateMotionControl(id,s),true);assert.equal(s.rigEnabled,true);
  assert.equal(activateMotionControl(id,s),false);
 }
 const s={rigEnabled:false};assert.equal(activateMotionControl('blink',s),false);assert.equal(s.rigEnabled,false);
});
