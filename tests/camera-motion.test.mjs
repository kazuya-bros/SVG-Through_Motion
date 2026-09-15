import test from 'node:test';
import assert from 'node:assert/strict';
import {cameraAngles,createCameraMotion,applyCameraPose} from '../web/camera-motion.js';

// Column-major Rz * Ry * Rx. Include nonzero translation and uniform scale.
function matrix(x=0,y=0,z=0,scale=1){
 const cx=Math.cos(x),sx=Math.sin(x),cy=Math.cos(y),sy=Math.sin(y),cz=Math.cos(z),sz=Math.sin(z);
 const data=[cz*cy,sz*cy,-sy,0,cz*sy*sx-sz*cx,sz*sy*sx+cz*cx,cy*sx,0,cz*sy*cx+sz*sx,sz*sy*cx-cz*sx,cy*cx,0,12,-8,50,1];
 for(const i of [0,1,2,4,5,6,8,9,10])data[i]*=scale;
 return {rows:4,columns:4,data};
}
test('camera rotation isolates XYZ from translation and scale',()=>{
 const a=cameraAngles(matrix(.2,-.3,.1,2));
 for(const [key,value] of Object.entries({pitch:.2,yaw:-.3,roll:.1}))assert.ok(Math.abs(a[key]-value)<1e-10);
 assert.equal(cameraAngles({rows:4,columns:4,data:Array(16).fill(0)}),null);
 assert.equal(cameraAngles({rows:4,columns:4,data:Array(16).fill(NaN)}),null);
 assert.equal(cameraAngles(null),null);
});
test('neutral calibration, bounded movement, smoothing, mirror and zero strength',()=>{
 const motion=createCameraMotion();
 assert.equal(motion.recenter(),false);
 assert.deepEqual(motion.update(matrix(.1,.1,.1),0),{yaw:0,pitch:0,headRoll:0});
 let p=motion.update(matrix(.4,.6,.6),80);
 assert.ok(p.yaw>0&&p.yaw<.3&&p.pitch<0&&p.pitch>-.225&&p.headRoll<0&&p.headRoll>-3);
 for(let t=160;t<3000;t+=80)p=motion.update(matrix(.9,1,1),t);
 assert.ok(p.yaw<=.3&&p.pitch>=-.225&&p.headRoll>=-3);
 assert.equal(motion.recenter(),true);
 assert.deepEqual(motion.update(matrix(.9,1,1),3100),{yaw:0,pitch:0,headRoll:0});
 motion.reset();motion.update(matrix(),0);
 const regular=motion.update(matrix(.3,.3,.3),80);
 motion.reset();motion.update(matrix(),0);
 const mirror=motion.update(matrix(.3,.3,.3),80,{mirror:true});
 assert.equal(mirror.yaw,-regular.yaw);assert.equal(mirror.headRoll,-regular.headRoll);assert.equal(mirror.pitch,regular.pitch);
 assert.deepEqual(motion.update(matrix(.3,.3,.3),160,{strength:0}),{yaw:0,pitch:0,headRoll:0});
 assert.deepEqual(motion.update(null,240),{});assert.equal(motion.recenter(),false);
});
test('rest jitter is ignored and tracked pose preserves artwork pitch and independent animation',()=>{
 const motion=createCameraMotion();motion.update(matrix(),0);
 assert.deepEqual(motion.update(matrix(.005,.005,.005),80),{yaw:0,pitch:0,headRoll:0});
 const idle={yaw:.5,pitch:.8,headRoll:4,bodyRoll:1,nod:3,hairPhase:2,mouth:0};
 const camera={yaw:.2,pitch:.1,headRoll:2,blinkL:.7,blinkR:.2,mouth:.6};
 const result=applyCameraPose(idle,camera,{headPitch:.3});
 assert.equal(result.pitch,.4);assert.equal(result.bodyRoll,.3);assert.equal(result.nod,0);
 assert.equal(result.hairPhase,2);assert.equal(result.mouth,.6);assert.equal(idle.pitch,.8);
 assert.deepEqual(applyCameraPose(idle,null),idle);
 assert.equal(applyCameraPose(idle,{mouth:.3}).yaw,.5);
});
