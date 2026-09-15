import test from 'node:test';import assert from 'node:assert/strict';
import {earEnabled,chooseEarLayer,earLayerSelection,idleGaze} from '../web/idle-expression.js';
import {loopPose,partMotion,sceneSvg} from '../web/motion.js';
import {validateMotion} from '../web/assist-motion.js';
test('gaze changes direction with holds and loops continuously, with no vertical motion',()=>{
 assert.equal(idleGaze(.23),idleGaze(.30));assert.notEqual(idleGaze(.23),idleGaze(.70));
 assert.equal(idleGaze(0),idleGaze(1));
 for(let t=0;t<1;t+=.001){assert.ok(Math.abs(idleGaze(t))<=1);assert.ok(Math.abs(idleGaze(t+.001)-idleGaze(t))<.04);}
 for(const irisGaze of ['natural','sweep']){
  const s={duration:4,irisScale:20,irisX:20,irisCycles:2,irisGaze};
  assert.deepEqual(loopPose(0,s),loopPose(4,s));
  for(let t=0;t<4;t+=.01){const p=loopPose(t,s);assert.ok(p.irisScale>=.9&&p.irisScale<=1.1);assert.equal(p.irisY,0);}
 }
 validateMotion({irisGaze:'natural',irisScale:10});assert.throws(()=>validateMotion({irisScale:11}));
});
test('headwear can be assigned to ear animation without changing its role or artwork',()=>{
 const p={width:100,height:100,settings:{},parts:[{id:'hat',name:'headwear',role:'static',visible:true,x:20,y:0,width:60,height:30,svgText:'<svg><path d="M0 0H60V30H0Z"/></svg>'},{id:'ear',role:'ear-l',visible:true,x:0,y:20,width:10,height:20,svgText:'<svg/>'}]};
 const original=p.parts[0].svgText;chooseEarLayer(p,'hat');
 assert.equal(p.parts[0].role,'static');assert.equal(p.parts[0].svgText,original);assert.ok(earEnabled(p.parts[0]));assert.ok(!earEnabled(p.parts[1]));
 assert.equal(earLayerSelection(JSON.parse(JSON.stringify(p))),'hat');
 const a=partMotion(p.parts[0],loopPose(.84,{duration:4,earPattern:'alternate',ears:20}),p).rotation;
 const b=partMotion(p.parts[0],loopPose(2.84,{duration:4,earPattern:'alternate',ears:20}),p).rotation;
 assert.ok(a*b<0);assert.match(sceneSvg(p),/secondary-turn-hat/);
 chooseEarLayer(p,'none');assert.ok(p.parts.every(x=>!earEnabled(x)));assert.doesNotMatch(sceneSvg(p),/secondary-turn-hat/);
 chooseEarLayer(p,'auto');assert.ok(earEnabled(p.parts[1]));assert.ok(!earEnabled(p.parts[0]));
});
