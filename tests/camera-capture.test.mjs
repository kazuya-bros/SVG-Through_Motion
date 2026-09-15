import test from 'node:test';
import assert from 'node:assert/strict';
import {createCameraCapture} from '../web/camera-capture.js';
const wait=async check=>{for(let i=0;i<100;i++){if(check())return;await new Promise(r=>setTimeout(r,10));}throw Error('camera update timed out');};
test('capture passes tracked rotation alongside expressions and clears it on loss/stop',async()=>{
 let yaw=0,face=true,stopped=false,closed=false,frames=0,latest;
 const video={currentTime:0,readyState:4,srcObject:null,play:async()=>{}};
 const track={stop(){stopped=true;},addEventListener(){}};
 class Tracker{
  busy=false;
  async init(){}
  async detect(){frames++;video.currentTime++;
   const c=Math.cos(yaw),s=Math.sin(yaw);
   return {faceBlendshapes:face?[{categories:[{categoryName:'jawOpen',score:.4}]}]:[],facialTransformationMatrixes:face?[{rows:4,columns:4,data:[c,0,-s,0,0,1,0,0,s,0,c,0,0,0,1,1]}]:[]};
  }
  close(){closed=true;}
 }
 const capture=createCameraCapture({video,Tracker,media:{getUserMedia:async()=>({getTracks:()=>[track],getVideoTracks:()=>[track]})},onPose:p=>latest=p});
 try{
  await capture.start();await wait(()=>frames>=1&&latest);
  assert.equal(capture.pose.yaw,0);
  yaw=.4;await wait(()=>capture.pose?.yaw>0);
  assert.ok(capture.pose.mouth>0);assert.ok(capture.pose.yaw<=.3);
  assert.equal(capture.recenter(),true);const before=frames;await wait(()=>frames>before&&Math.abs(capture.pose.yaw)<1e-9);
  face=false;await wait(()=>capture.pose===null);assert.equal(capture.recenter(),false);
  capture.stop();assert.equal(video.srcObject,null);assert.equal(capture.active,false);assert.equal(capture.pose,null);
  assert.ok(stopped&&closed);
 }finally{capture.stop();}
});
