import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseAccessory,accessorySelection} from '../web/accessory-targets.js';
import {earEnabled} from '../web/idle-expression.js';
import {secondaryConfig,secondaryRigid} from '../web/secondary-motion.js';
import {normalizeSecondary,secondaryPoint} from '../web/secondary-motion.js';
test('both ears survives single/none selection and JSON, leaving independent pivots',()=>{
 const p={parts:[{id:'p000',role:'ear-l',pivotX:10,pivotY:20},{id:'p001',role:'ear-r',pivotX:50,pivotY:21},{id:'p002',role:'static'}]};
 chooseAccessory(p,'ear','p000');assert.deepEqual(p.parts.map(earEnabled),[true,false,false]);
 chooseAccessory(p,'ear','none');chooseAccessory(p,'ear','both');assert.equal(accessorySelection(p,'ear'),'both');assert.deepEqual(p.parts.map(earEnabled),[true,true,false]);
 assert.deepEqual(JSON.parse(JSON.stringify(p)).parts.map(v=>v.pivotX),[10,50,undefined]);chooseAccessory(p,'ear','auto');assert.equal(accessorySelection(p,'ear'),'auto');assert.deepEqual(p.parts.map(earEnabled),[true,true,false]);
 assert.throws(()=>chooseAccessory(p,'wing','both'));assert.throws(()=>chooseAccessory({parts:[p.parts[0]]},'ear','both'));
});
test('both wings uses two inferred layers and keeps each pivot targetable',()=>{
 const p={parts:[{id:'p000',name:'wings-l',x:10,pivotX:12},{id:'p001',name:'wings-r',x:60,pivotX:62},{id:'p002',name:'body'}]};
 chooseAccessory(p,'wing','both');assert.equal(accessorySelection(p,'wing'),'both');assert.deepEqual(p.parts.map(v=>v.wingMotion),[true,true,false]);
 chooseAccessory(p,'wing','p001');assert.equal(accessorySelection(p,'wing'),'p001');assert.equal(p.parts[0].wingMotion,false);assert.equal(p.parts[1].wingMotion,true);
});
test('speech brows default on; saved off is respected by actual pose',()=>{
 const brow={id:'p000',role:'brow-l',x:10,y:10,width:20,height:10},p={width:100,height:1000,parts:[brow]};
 assert(secondaryConfig(brow,p).enabled);assert(secondaryRigid(brow,{mouth:1},p).y<0);
 brow.secondaryMotion={enabled:false};assert.equal(secondaryConfig(brow,p).enabled,false);assert.equal(secondaryRigid(brow,{mouth:1},p).y,0);
 assert.equal(secondaryConfig({role:'static'},p).enabled,false);
});
test('clothing direction is normalized and moves along the selected vector',()=>{
 const part={id:'p000',name:'bottomwear',role:'static',x:0,y:0,width:100,height:100,secondaryMotion:normalizeSecondary({enabled:true,amount:100,region:{cx:.5,cy:.5,rx:.5,ry:.5},direction:'vertical'})};
 const project={width:100,height:100,parts:[part]};const pose={secondaryPhase:Math.PI/2};const vertical=secondaryPoint(50,50,{width:100,height:100,parts:[part]},pose);
 assert.equal(vertical[0],50);assert(vertical[1]>50);
 for(const d of ['horizontal','vertical','diag-down','diag-up'])assert.equal(normalizeSecondary({direction:d}).direction,d);
 assert.equal(normalizeSecondary({direction:'bad'}).direction,undefined);
});
