import test from 'node:test';
import assert from 'node:assert/strict';
import {hairLashOpacity,sceneSvg,channelValue} from '../web/motion.js';
import {segmentOffset,frontHairEnd,faceMotion} from '../web/rig.js';

test('cropped hair ink stays registered to its eye or brow during pitch and yaw',()=>{
 const art='<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L10 0L0 10Z"/></svg>';
 const owner={id:'owner',role:'lash-l',x:520,y:290,width:90,height:50,visible:true,opacity:1,svgText:art};
 const overlay={id:'overlay',role:'static',blinkOverlay:'l',x:590,y:300,width:14,height:9,visible:true,opacity:1,svgText:art};
 const p={width:1024,height:1024,parts:[owner,overlay],rig:{faceX:500,faceWidth:300},settings:{rigEnabled:true,rigMode:'stable'}};
 for(const mode of ['stable','soft'])for(const type of ['lash','brow']){
  p.settings.rigMode=mode;owner.role=type+'-l';delete overlay.blinkOverlay;delete overlay.faceOverlay;
  if(type==='lash')overlay.blinkOverlay='l';else overlay.faceOverlay='brow-l';
  for(const pitch of [-1,0,1])for(const yaw of [-1,0,1]){
   const pose={pitch,yaw,nod:4},a=faceMotion(owner,p,pose),b=faceMotion(overlay,p,pose);
   const map=(part,m,x)=>{const cx=part.x+part.width/2;return (x-cx)*m.sx+cx+m.x;};
   for(const x of [overlay.x,overlay.x+overlay.width])assert.ok(Math.abs(map(owner,a,x)-map(overlay,b,x))<1e-9);
   assert.equal(a.y,b.y);
   const exported=channelValue('face-shift-overlay',pose,p).value.split(' ').map(Number);
   assert.ok(Math.hypot(exported[0]-b.x,exported[1]-b.y)<1e-5);
  }
  const svg=sceneSvg(p,p.settings,false);
  assert.match(svg,/data-channel="face-shift-overlay"/);
  assert.match(svg,/data-channel="face-scale-overlay"/);
  assert.equal(svg.includes('data-channel="hair-lash-l"'),type==='lash');
 }
 p.parts=[overlay];assert.deepEqual(faceMotion(overlay,p,{pitch:1}),{x:0,y:0,sx:1});
});
test('hair-overlapping ink follows each blink and vanishes before full closure',()=>{
 for(const side of ['l','r']){
  const key=side==='l'?'blinkL':'blinkR',other=side==='l'?'blinkR':'blinkL';
  assert.equal(hairLashOpacity({[other]:1},side),1);
  assert.equal(hairLashOpacity({[key]:1},side),0);
  assert.equal(hairLashOpacity({[key]:.6},side),0);
  assert.equal(hairLashOpacity({[key]:.3},side),.5);
  assert.equal(channelValue('hair-lash-'+side,{[key]:.3},{settings:{}}).value,.5);
 }
 const p={width:100,height:100,parts:[{id:'overlay',role:'static',blinkOverlay:'l',x:0,y:0,width:10,height:10,visible:true,opacity:1,svgText:'<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0 L10 0 L0 10Z"/></svg>'}],settings:{}};
 assert.match(sceneSvg(p),/data-channel="hair-lash-l"/);
});
test('short bangs reach their requested amplitude at the eye line',()=>{
 const p={width:1024,height:1024,rig:{headTop:50,faceY:360,faceWidth:300,neckY:520},settings:{frontHair:5,hairTip:2.2,hairMethod:'spring',duration:4},deformGroup:'front',parts:[{}]};
 const end=frontHairEnd(p);assert.ok(end<400);
 let peak=0;for(let i=0;i<120;i++)peak=Math.max(peak,Math.abs(segmentOffset(500,end,p,{hairPhase:i/120*Math.PI*2})[0]));
 assert.ok(peak>4.95&&peak<=5);
 assert.deepEqual(segmentOffset(500,50,p,{hairPhase:1}),[0,0]);
});
