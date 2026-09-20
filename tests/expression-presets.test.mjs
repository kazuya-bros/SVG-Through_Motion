import test from 'node:test';
import assert from 'node:assert/strict';
import {applyExpression,normalizeExpressions,reviewPose,reviewSteps} from '../web/expression-presets.js';
import {cameraExpression} from '../web/camera-expression.js';
import {secondaryRigid} from '../web/secondary-motion.js';
import {partMotion} from '../web/motion.js';
import {stagePose,defaultScene} from '../web/stage-model.js';

test('brow tilt is independent of height, survives presets and stage control, and keeps overlays attached',()=>{
 const list=normalizeExpressions([{name:'困り眉',pose:{browL:.3,browTiltL:2,browTiltR:.8}}]);
 assert.equal(list[0].pose.browTiltL,1);assert.deepEqual(normalizeExpressions(JSON.parse(JSON.stringify(list))),list);
 const pose=applyExpression({mouth:.7},list[0],.5);assert.equal(pose.browTiltL,.5);assert.equal(pose.mouth,.7);
 const left={id:'left',role:'brow-l',x:600,y:300,width:90,height:20},right={id:'right',role:'brow-r',x:330,y:300,width:90,height:20},overlay={id:'overlay',faceOverlay:'brow-l',role:'static',x:610,y:307,width:20,height:5};
 const p={width:1024,height:1024,rig:{faceX:512},parts:[left,right,overlay]};
 const tilted={browL:.3,browTiltL:1,browTiltR:1};
 assert.ok(secondaryRigid(left,tilted,p).rotation>0);assert.ok(secondaryRigid(right,tilted,p).rotation<0);
 assert.equal(secondaryRigid(left,tilted,p).y,secondaryRigid(left,{browL:.3},p).y);
 assert.deepEqual(partMotion(overlay,tilted,p),partMotion(left,tilted,p));
 const scene=defaultScene();scene.pose.browTiltL=.6;assert.equal(stagePose(pose,scene).browTiltL,1);
});
test('expressions preserve live speech and clamp imported poses',()=>{
 const list=normalizeExpressions([{name:'Smile',pose:{mouth:1,blinkL:2,browR:-5,irisScale:NaN,yaw:1}}]);
 assert.deepEqual(list[0].pose,{blinkL:1,browR:-1});
 const pose=applyExpression({mouth:.73,blinkL:.2,yaw:.3},list[0],.5);
 assert.equal(pose.mouth,.73);assert.equal(pose.yaw,.3);assert.ok(Math.abs(pose.blinkL-.6)<1e-12);
 assert.deepEqual(applyExpression(pose,{pose:{}},1),pose);
});
test('review gives deterministic isolated directions, closure and mouth opening',()=>{
 assert.equal(reviewSteps.length,7);assert.ok(reviewPose(1).yaw<0);assert.ok(reviewPose(2).yaw>0);
 assert.equal(reviewPose(5).blinkL,1);assert.equal(reviewPose(5).mouth,0);assert.equal(reviewPose(6).mouth,1);assert.equal(reviewPose(6).yaw,0);
});
test('camera gaze and brow input is smoothed, mirrored and can be disabled',()=>{
 const cats=Object.entries({eyeLookInLeft:1,eyeLookOutRight:1,browOuterUpLeft:1}).map(([categoryName,score])=>({categoryName,score}));
 const p=cameraExpression(cats,{},{});assert.ok(p.irisX>0&&p.irisX<8);assert.ok(p.browL>p.browR);
 assert.equal(cameraExpression(cats,{}, {mirror:true}).irisX,-p.irisX);
 assert.equal(cameraExpression(cats,{}, {swap:true}).browR,p.browL);
 assert.deepEqual(cameraExpression(cats,p,{expressionStrength:0}),{irisX:0,irisY:0,browL:0,browR:0});
 const part={role:'brow-l'};assert.ok(secondaryRigid(part,{browL:.5},{height:1000,parts:[part]}).y<0);
 assert.deepEqual(secondaryRigid({...part,earMotion:true},{browL:.5},{height:1000,parts:[part]}),{rotation:0,y:0});
});
