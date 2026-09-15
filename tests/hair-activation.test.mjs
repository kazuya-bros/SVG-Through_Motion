import test from 'node:test';
import assert from 'node:assert/strict';
import {activateHairControl,hairControlIds} from '../web/hair-activation.js';
import {rigGroups,segmentOffset,normalizeRig} from '../web/rig.js';
test('hair controls activate the disabled rig; unrelated controls do not',()=>{
 for(const id of hairControlIds){const s={rigEnabled:false};assert.equal(activateHairControl(id,s),true);assert.equal(s.rigEnabled,true);assert.equal(activateHairControl(id,s),false);}
 const s={rigEnabled:false};assert.equal(activateHairControl('sway',s),false);assert.equal(s.rigEnabled,false);
});
test('current hair amplitude remains effective with a saved zero per-part multiplier',()=>{
 const p={width:1024,height:1024,settings:{rigEnabled:true,independentHair:true,frontHair:36.5,backHair:58.5,frontHairMethod:'spring',backHairMethod:'wave',duration:4},parts:['front','back'].map(kind=>({id:kind,role:'static',deformGroup:kind,visible:true,motionStrength:0,x:0,y:0,width:1024,height:1024}))};
 p.rig=normalizeRig({segmented:true},p);
 for(const group of rigGroups(p)){
  const amplitude=Math.max(...Array.from({length:60},(_,i)=>Math.abs(segmentOffset(600,1024,group,{hairPhase:i/60*Math.PI*2})[0])));
  assert.ok(amplitude>20,group.deformGroup);
 }
 p.settings.frontHair=p.settings.backHair=0;
 for(const g of rigGroups(p))assert.deepEqual(segmentOffset(600,1024,g,{hairPhase:1}),[0,0]);
});
