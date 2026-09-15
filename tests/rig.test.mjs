import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeRig,rigPose,warpPoint,triangleMatrix,decompose,mesh,faceMotion} from '../web/rig.js';
import {sceneSvg,loopPose,channelValue} from '../web/motion.js';
const project={width:1024,height:1024,parts:[],settings:{rigMode:'soft',rigEnabled:true,duration:4,headTilt:5,headYaw:.5,headNod:4,bodyFollow:.3,hairBend:20}};
project.rig=normalizeRig({neckX:512,neckY:512,hairGridSize:2,hairWeights:[1,1,1,1]},project);
test('up/down orientation reverses face parallax and stays continuous through the loop',()=>{
 const p={...project,settings:{...project.settings,rigMode:'stable',headPitch:.2,pitchSway:.7}};
 const part={x:450,y:380,width:60,height:40,role:'lash-l'};
 assert.ok(warpPoint(480,380,p,{pitch:1})[1]<380);assert.ok(warpPoint(480,380,p,{pitch:-1})[1]>380);
 assert.deepEqual(rigPose(0,p.settings),rigPose(4,p.settings));
 for(const pitch of [-1,0,1])for(const t of mesh(p)){const m=triangleMatrix(t,p,{pitch});assert.ok(m.every(Number.isFinite)&&m[0]*m[3]-m[1]*m[2]>.8);}
});
test('rig loop endpoints match; body follows with phase delay',()=>{
  assert.deepEqual(rigPose(0,project.settings),rigPose(4,project.settings));
  const pose=rigPose(0,project.settings);assert.equal(pose.headRoll,0);assert.ok(pose.bodyRoll<0);
});
test('hair root stays pinned; tip bends and lags; no mask leaves clothing unaffected',()=>{
  const p={...project,rig:{...project.rig,headTop:100}},pose={hairBend:20,hairPhase:Math.PI/2};
  assert.deepEqual(warpPoint(100,100,p,pose),[100,100]);
  // Spring phase lag may put this particular frame near neutral; test a full cycle.
  assert.ok(Math.max(...Array.from({length:32},(_,i)=>Math.abs(warpPoint(100,800,p,{...pose,hairPhase:i/32*Math.PI*2})[0]-100)))>2);
  const noHair={...p,rig:{...p.rig,hairWeights:undefined}};
  assert.deepEqual(warpPoint(100,800,noHair,pose),[100,800]);
});
test('mesh affine maps shared triangle vertices exactly, with finite non-folding extremes',()=>{
  for(let t=0;t<4;t+=.2)for(const tri of mesh(project)){
    const pose=rigPose(t,project.settings),m=triangleMatrix(tri,project,pose),[a,b,c,d,e,f]=m;
    assert.ok(a*d-b*c>.4);
    for(const [x,y] of tri){const q=warpPoint(x,y,project,pose);assert.ok(Math.hypot(q[0]-(a*x+c*y+e),q[1]-(b*x+d*y+f))<1e-8);}
    const v=decompose(m),r=v.rotate[0]*Math.PI/180,k=Math.tan(v.skewX[0]*Math.PI/180),[sx,sy]=v.scale;
    const restored=[Math.cos(r)*sx,Math.sin(r)*sx,(Math.cos(r)*k-Math.sin(r))*sy,(Math.sin(r)*k+Math.cos(r))*sy,...v.translate];
    restored.forEach((v,i)=>assert.ok(Math.abs(v-m[i])<1e-8));
  }
});
test('face features use restrained depth parallax while base artwork has no extra shift',()=>{
  const part={x:450,y:400,width:60,height:30,role:'mouth'};
  const mouth=faceMotion(part,project,{yaw:.8,pitch:1}),glasses=faceMotion({...part,role:'glasses'},project,{yaw:.8,pitch:1});
  assert.ok(mouth.x>0&&mouth.x<5&&mouth.y<0);assert.ok(glasses.x>mouth.x);assert.equal(mouth.sx,1);
  assert.deepEqual(faceMotion({...part,role:'static'},project,{yaw:.8}),{x:0,y:0,sx:1});
});
test('standalone SVG shares vector artwork and animates decomposed mesh transforms',()=>{
  const text=sceneSvg(project);assert.ok(text.includes('id="rig-art"'));assert.equal((text.match(/<use href="#rig-cell-/g)||[]).length,432);
  assert.equal(channelValue('mesh-0-skewX',loopPose(1,project.settings),project).type,'skewX');
});
