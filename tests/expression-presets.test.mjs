import test from 'node:test';
import assert from 'node:assert/strict';
import {applyExpression,normalizeExpressions,reviewPose,reviewSteps} from '../web/expression-presets.js';
import {cameraExpression} from '../web/camera-expression.js';
import {secondaryRigid} from '../web/secondary-motion.js';
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
