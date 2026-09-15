import test from 'node:test';
import assert from 'node:assert/strict';
import {loopPose,irisMotion,sceneSvg,channelValue,partMotion} from '../web/motion.js';
import {validateMotion} from '../web/assist-motion.js';

test('bounce is once per loop even when a saved project contains an old repeat count',()=>{
 for(const count of [1,3,6]){
  const s={duration:4,singleBounce:true,bounceCount:count,bounceHeight:80,hair:12,chest:20,ears:18};
  assert.deepEqual(loopPose(0,s),loopPose(4,s));
  let troughs=0;
  for(let i=1;i<2400;i++)if(loopPose(i/600,s).bounce<loopPose((i-1)/600,s).bounce&&loopPose(i/600,s).bounce<loopPose((i+1)/600,s).bounce)troughs++;
  assert.equal(troughs,1);
  assert.equal(Math.abs(loopPose(1,{...s,singleBounce:false}).bounce),0);
 }
});
test('iris idle motion is opt-in, periodic and moves both eyes together',()=>{
 const settings={duration:4,irisX:16,irisY:9,irisScale:10,irisCycles:2};
 assert.deepEqual(loopPose(0,settings),loopPose(4,settings));
 assert.equal(loopPose(1,{duration:4,irisY:12}).irisY,0);
 const off=loopPose(1,{duration:4});assert.equal(Math.abs(off.irisX),0);assert.equal(off.irisY,0);assert.equal(off.irisScale,1);
 const p={x:10,y:20,width:40,height:50},other={...p,x:80};
 for(let t=0;t<4;t+=.031){const pose=loopPose(t,settings),a=irisMotion(p,pose),b=irisMotion(other,pose);assert.equal(a.x,b.x);assert.equal(a.y,b.y);assert.equal(a.scale,b.scale);assert.ok(a.scale>=.9&&a.scale<=1.1);}
});

test('large hops keep accessory follow within its own amplitude range',()=>{
 for(let t=0;t<4;t+=.005){const pose=loopPose(t,{duration:4,singleBounce:true,bounceCount:6,bounceHeight:160,hair:25,chest:40,ears:30});assert.ok(Math.abs(pose.hairAngle)<=25);assert.ok(Math.abs(pose.earAngle)<=30);assert.ok(Math.abs(pose.chestOffset)<=44.8);}
});
test('iris movement remains inside the stationary SVG eye mask and uses exportable channels',()=>{
 const p={width:100,height:100,settings:{},parts:[{id:'w',role:'white-l',x:10,y:20,width:40,height:30,visible:true,opacity:1,svgText:'<svg><path d="M0 0H40V30H0Z" fill="white"/></svg>'},{id:'i',role:'iris-l',x:20,y:22,width:20,height:25,visible:true,opacity:1,svgText:'<svg><circle cx="10" cy="12" r="10"/></svg>'}]};
 assert.match(sceneSvg(p),/mask="url\(#eye-clip-l\)"><g data-channel="iris-shift-i">/);
 assert.equal(channelValue('iris-shift-i',{irisX:5,irisY:-2},p).value,'35 32.5');
 assert.equal(channelValue('iris-size-i',{irisScale:1.1},p).value,'1.1 1.1');
 validateMotion({irisX:20,irisScale:10,irisCycles:4,headTilt:8,headNod:6,backHair:70});
 assert.throws(()=>validateMotion({bounceCount:6}));
 assert.throws(()=>validateMotion({irisCycles:1.5}));
});

test('chest sway works without bounce, stops at zero and is bounded while hopping',()=>{
 const s={duration:4,chest:40,singleBounce:false};
 assert.equal(loopPose(1,s).chestOffset,24);
 assert.equal(loopPose(1,{...s,chest:0}).chestOffset,0);
 const part={id:'c',role:'chest',x:20,y:50,width:30,height:20,visible:true,opacity:1,svgText:'<svg><path d="M0 0H30V20H0Z"/></svg>'};
 const project={width:100,height:100,parts:[part]};
 assert.equal(partMotion(part,loopPose(1,s),project).y,24);
 assert.equal(partMotion({...part,role:'static'},loopPose(1,s),project).y,0);
 assert.match(sceneSvg(project,s,false),/secondary-shift-c/);
 assert.equal(channelValue('secondary-shift-c',loopPose(1,s),project,s).value,'0 24');
 for(let t=0;t<4;t+=.005)assert.ok(Math.abs(loopPose(t,{...s,singleBounce:true,bounceHeight:160}).chestOffset)<=40);
});
