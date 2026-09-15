import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeRig,rigPose,warpPoint,faceMotion,mesh,triangleMatrix} from '../web/rig.js';
import {doubleSpring,restrainedDefaults} from '../web/pachipaku-motion.js';
const p={width:1024,height:1024,parts:[],settings:{...restrainedDefaults,duration:4,rigEnabled:true}};
p.rig=normalizeRig({neckX:518,neckY:517,faceX:518,faceY:373,faceWidth:305,hairGridSize:2,hairWeights:[1,1,1,1]},p);
test('face proportions remain within 1% and torso is rigid under a bad hair mask',()=>{
  for(let t=0;t<4;t+=.05){const pose=rigPose(t,{...p.settings,headYaw:0,headPitch:0});
    for(const [a,b] of [[[430,320],[610,415]],[[470,680],[570,850]]]){
      const q=warpPoint(...a,p,pose),r=warpPoint(...b,p,pose);
      const distance=Math.hypot(a[0]-b[0],a[1]-b[1]),error=Math.abs(Math.hypot(q[0]-r[0],q[1]-r[1])-distance);
      assert.ok(error<(a[1]>600?1e-8:distance*.01));
    }
  }
});
test('bounded double springs close the loop and remain independent of rendering order',()=>{
  for(const duration of [1,2,4,10,30])for(let t=0;t<duration;t+=duration/31){const phase=t/duration*Math.PI*2;
    const a=doubleSpring(phase,5,duration,3);assert.ok(Math.abs(a.stiff)<=3&&Math.abs(a.soft)<=3);
    const b=doubleSpring(phase+2*Math.PI,5,duration,3);assert.ok(Math.abs(a.stiff-b.stiff)<1e-10&&Math.abs(a.soft-b.soft)<1e-10);
  }
});
test('local hair motion respects the expanded 30px limit; stable face has no differential squashing',()=>{
  const pose={hairBend:30,hairPhase:1.2};
  for(let y=0;y<=1024;y+=16)for(let x=0;x<=1024;x+=16){const q=warpPoint(x,y,p,pose);assert.ok(Math.abs(q[0]-x)<=30.00001);assert.equal(q[1],y);}
  assert.equal(faceMotion({role:'mouth',x:502,y:396,width:58,height:37},p,{yaw:1}).sx,1);
});
test('stable mesh remains connected and does not fold under maximum controls',()=>{
  const q={...p,settings:{...p.settings,headTilt:16,headNod:24,bodyFollow:1,hairBend:30}};
  for(let t=0;t<4;t+=.2)for(const tri of mesh(q)){const [a,b,c,d]=triangleMatrix(tri,q,rigPose(t,q.settings));assert.ok(a*d-b*c>.3);}
});
