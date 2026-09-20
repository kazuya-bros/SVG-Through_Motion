import test from 'node:test';
import assert from 'node:assert/strict';
import {naturalMotionSettings} from '../web/natural-motion.js';
test('reset returns all idle motion controls to a repeatable baseline and preserves appearance',()=>{
 const tuning={closed:{x:5}},before={background:'transparent',renderSource:'svg',mouthTuning:tuning,frontHair:40,backHair:70,rigEnabled:false,irisX:20,irisScale:10,ears:30,chest:40,singleBounce:true,talking:true,duration:20};
 const a=naturalMotionSettings(before),b=naturalMotionSettings(a);
 assert.deepEqual(a,b);assert.equal(a.background,'transparent');assert.equal(a.renderSource,'svg');assert.equal(a.mouthTuning,tuning);
 assert.equal(a.rigEnabled,true);assert.equal(a.singleBounce,false);assert.equal(a.talking,true);assert.equal(a.blink,true);
 assert.equal(a.irisX,0);assert.equal(a.irisScale,0);assert.equal(a.chest,0);assert.equal(a.ears,0);assert.equal(a.duration,4);
 assert.equal(before.frontHair,40);assert.equal(a.frontHair,4);assert.equal(a.backHair,9);
});
