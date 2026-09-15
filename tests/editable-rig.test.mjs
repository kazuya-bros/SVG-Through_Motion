import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeLid,lidProfile,closedLashArtwork} from '../web/eyelid-controls.js';
import {normalizeStrands,blendStrands} from '../web/hair-strands.js';
import {segmentOffset,mesh,triangleMatrix,rigPose,normalizeRig} from '../web/rig.js';
const xs=Array.from({length:20},(_,i)=>i*3),path='M '+[...xs.map(x=>`${x} 20`),...xs.toReversed().map(x=>`${x} 25`)].join(' L ')+' Z M 20 24 L 22 33 L 24 24 Z';
const part={width:60,height:40,closedSvgText:`<svg xmlns="http://www.w3.org/2000/svg" width="60" height="40"><path d="${path}" fill="#231412"/></svg>`};
test('closed-lash changes are reversible and do not mutate original artwork',()=>{
 assert.ok(lidProfile(part.closedSvgText));assert.equal(closedLashArtwork(part),part.closedSvgText);
 const p={...part,lidAdjust:{y:4,angle:-8,width:.85,thickness:.7,curve:5,spikes:0}};
 const result=closedLashArtwork(p);assert.match(result,/translate\(0 4\)/);assert.match(result,/rotate\(-8\)/);assert.match(result,/scale\(0.85 1\)/);
 assert.notEqual(result,part.closedSvgText);assert.equal(p.closedSvgText,part.closedSvgText);
 assert.ok(!result.includes('NaN'));assert.equal(normalizeLid({thickness:100}).thickness,2);
 assert.equal(lidProfile('<svg><path d="M 0 0 C 1 2 3 4 5 6Z"/></svg>'),null);
});
test('strand geometry is bounded and blends continuously between independently phased locks',()=>{
 const p={width:1024,height:1024};const list=normalizeStrands([{rootX:300,rootY:80,tipX:350,tipY:350,width:160,gain:1,delay:0},{rootX:600,rootY:80,tipX:620,tipY:330,width:160,gain:.8,delay:1}],p);
 assert.equal(blendStrands(500,40,list,(u,g,d)=>u*g*Math.sin(1-d)),0);
 const response=(u,g,d)=>u*g*Math.sin(1-d);
 assert.notEqual(blendStrands(350,330,list,response),blendStrands(620,330,list,response));
 for(let x=200;x<750;x++)assert.ok(Math.abs(blendStrands(x,300,list,response)-blendStrands(x+.001,300,list,response))<.001);
 const bad=normalizeStrands([{rootX:-1,rootY:9999,tipX:9999,tipY:0,width:0,gain:99,delay:99}],p)[0];assert.ok(bad.tipY>bad.rootY&&bad.width>=102.4&&bad.gain<=1.5);
});
test('strand loops remain periodic and shared meshes keep their orientation',()=>{
 const p={width:1024,height:1024,parts:[{deformGroup:'front',hairStrands:normalizeStrands([0,1,2].map(i=>({rootX:380+i*120,rootY:70,tipX:350+i*150,tipY:290+i*35,width:120,gain:1.5,delay:i*.6})),{width:1024,height:1024})}],settings:{duration:4,rigEnabled:true,frontHair:12,hairTip:2,hairMethod:'spring',headTilt:2},deformGroup:'front'};
 p.rig=normalizeRig({segmented:true,headTop:40,neckY:500},p);
 for(const method of ['wave','spring']){p.settings.hairMethod=method;
  assert.ok(Math.abs(segmentOffset(500,300,p,{hairPhase:0})[0]-segmentOffset(500,300,p,{hairPhase:Math.PI*2})[0])<1e-9);
  for(let i=0;i<24;i++)for(const t of mesh({...p,deformGroup:undefined})){const m=triangleMatrix(t,p,rigPose(i/6,p.settings));assert.ok(m.every(Number.isFinite)&&m[0]*m[3]-m[1]*m[2]>.3);}
 }
});
