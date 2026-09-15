import test from 'node:test';
import assert from 'node:assert/strict';
import {channelValue,loopPose} from '../web/motion.js';
import {normalizeRig} from '../web/rig.js';
const p={width:1024,height:1024,settings:{duration:4,rigEnabled:true,frontHair:20,backHair:30,frontHairMethod:'spring',backHairMethod:'wave',frontHairCycles:1,backHairCycles:2},parts:[{id:'front',deformGroup:'front',x:250,y:50,width:500,height:400},{id:'back',deformGroup:'back',x:100,y:30,width:800,height:980}]};p.rig=normalizeRig({},p);
test('SVG hair channels are periodic, independent, and stop at zero amplitude',()=>{
 for(const channel of ['svg-hair-front','svg-hair-back'])assert.deepEqual(channelValue(channel,loopPose(0,p.settings),p),channelValue(channel,loopPose(4,p.settings),p));
 const pose=loopPose(.7,p.settings),back=channelValue('svg-hair-back',pose,p);
 const changed={...p,settings:{...p.settings,frontHair:0,frontHairMethod:'wave',frontHairCycles:4}};
 assert.equal(channelValue('svg-hair-front',pose,changed).value,'0');assert.deepEqual(channelValue('svg-hair-back',pose,changed),back);
 assert.notEqual(channelValue('svg-hair-front',pose,p).value,'0');
});
test('SVG common transform contains body follow only; face XYZ is local',()=>{
 assert.equal(channelValue('svg-rig-turn',{headRoll:30},p).value,'0 512 819.2');
 assert.equal(channelValue('svg-rig-turn',{bodyRoll:30},p).value,'8 512 819.2');
 assert.equal(channelValue('svg-rig-shift',{nod:30},p).value,'0 0');
});
