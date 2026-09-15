import test from 'node:test';
import assert from 'node:assert/strict';
import {moveMaterial,parentAllowed,localCrop,materialChecks,materialGroups} from '../web/material-state.js';
test('preview repair groups match exported owner order and keep facial masks together',()=>{
 const a={id:'a',role:'static',visible:true,tag:'face'},b={id:'b',visible:true},c={id:'c',visible:true,repair:true,parent:'a'};
 assert.deepEqual(materialGroups([a,b,c]).flat().map(p=>p.id),['a','c','b']);
 const white={id:'w',role:'white-l',visible:true},iris={id:'i',role:'iris-l',visible:true},attached={id:'d',role:'static',visible:true,followPart:'a'};
 const p={parts:[a,white,iris,attached],rig:{segmented:true},settings:{independentHair:true}};
 assert.ok(rigGroups(p).some(g=>g.parts.includes(white)&&g.parts.includes(iris)));
});
import {attachmentOwner,attachmentOffset} from '../web/attachments.js';
import {rigGroups,warpPoint} from '../web/rig.js';
import {partMotion} from '../web/motion.js';
test('attached ornament shares owner rotation and pivot as well as mesh movement',()=>{const ear={id:'ear',role:'ear-l',x:10,y:5,width:20,height:40},jewel={id:'jewel',role:'static',x:12,y:40,width:4,height:8,followPart:'ear'},project={width:100,parts:[ear,jewel]},pose={earAngleL:12,earLift:2};assert.deepEqual(partMotion(jewel,pose,project),partMotion(ear,pose,project));});
test('draw order, locks and attachment cycles are independent',()=>{const layers=[{id:'a'},{id:'b',parent:'a'},{id:'c',parent:'b',locked:true}];assert.equal(parentAllowed(layers,'a','c'),false);assert.equal(parentAllowed(layers,'c','a'),true);assert.deepEqual(moveMaterial(layers,'a',1).map(p=>p.id),['b','a','c']);assert.deepEqual(moveMaterial(layers,'c',-1),layers);const rendered=layers.map(p=>({...p,followPart:p.parent}));assert.equal(attachmentOwner(rendered[2],rendered).id,'a');});
test('selection crops in source coordinates after scale and translation',()=>{assert.deepEqual(localCrop([25,35,45,55],{x:5,y:15,scale:2},[30,30]),[10,10,20,20]);assert.throws(()=>localCrop([0,0,3,3],{x:5,y:15,scale:2},[30,30]));});
test('material check identifies duplicate candidates without claiming visual quality',()=>{const messages=materialChecks({layers:[{tag:'face',visible:true},{tag:'face',visible:true}]});assert.ok(messages.some(s=>s.includes('複数')));assert.ok(messages.some(s=>s.includes('開いた口')));});
test('accessories inherit the owner deformation and their depth adds parallax',()=>{const face={id:'a',role:'static',deformGroup:'core',visible:true,x:25,y:10,width:50,height:50,faceBase:true};const part={id:'b',role:'static',deformGroup:'core',visible:true,x:20,y:25,width:60,height:10,followPart:'a',attachmentDepth:0};const project={width:100,height:100,parts:[face,part],rig:{faceX:50,faceY:35,faceWidth:50,headTop:10,neckX:50,neckY:60,segmented:true},settings:{rigEnabled:true,independentHair:true,rigMode:'stable'}};const groups=rigGroups(project),pose={yaw:.3,pitch:.1,headRoll:2,mouth:0};assert.equal(groups.length,2);assert.deepEqual(warpPoint(30,30,groups[0],pose),warpPoint(30,30,groups[1],pose));const shifted={...part,attachmentDepth:.5};assert.ok(attachmentOffset(shifted,project,pose)[0]>0);assert.deepEqual(attachmentOffset(shifted,{...project,settings:{rigEnabled:false}},pose),[0,0]);});
