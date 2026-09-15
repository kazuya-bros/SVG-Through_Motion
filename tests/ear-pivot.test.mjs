import test from 'node:test';
import assert from 'node:assert/strict';
import {earMotion,loopPose,partMotion,channelValue} from '../web/motion.js';
import {boundedPivot,applyPivot,pivotScreenPoint,pivotFromScreen} from '../web/pivot-picker.js';
import {segmentOffset} from '../web/rig.js';
import {validateMotion} from '../web/assist-motion.js';
test('ear patterns are periodic, bounded, opt-in and independent of bounce',()=>{
 const signatures=[];
 for(const earPattern of ['twitch','double','alternate','droop','up']){
  const s={duration:4,ears:30,earPattern,earCycles:3};
  validateMotion(s);
  assert.deepEqual(loopPose(0,s),loopPose(4,s));
  const signature=[];
  for(let i=0;i<400;i++){
   const p=earMotion(i/400,s);signature.push(p);
   for(const v of Object.values(p))assert.ok(Math.abs(v)<=30);
   assert.deepEqual(p,earMotion(i/400,{...s,singleBounce:true}));
   assert.ok(Object.values(earMotion(i/400,{...s,ears:0})).every(v=>v===0));
  }
  signatures.push(JSON.stringify(signature));
 }
 assert.equal(new Set(signatures).size,5);
 const p=earMotion(.21,{ears:20,earPattern:'alternate'});assert.ok(p.earAngleL>0);assert.equal(p.earAngleR,0);
 const part={id:'ear',role:'ear-l',x:10,y:10,width:10,height:20};
 assert.equal(channelValue('secondary-turn-ear',p,{width:100,parts:[part]}).value.split(' ')[0],String(partMotion(part,p,{width:100}).rotation));
 assert.throws(()=>validateMotion({earCycles:1.5}));assert.throws(()=>validateMotion({earPattern:'unknown'}));
});

test('animated pivot picking maps back to artwork coordinates and previews without saving',()=>{
 const part={id:'a',deformGroup:'arm-r',role:'static',x:200,y:500,width:150,height:450};
 const project={width:1024,height:1024,parts:[part],settings:{rigEnabled:true,rigMode:'stable',independentHair:true,armSwing:8},rig:{segmented:true,neckX:512,neckY:530,faceX:512,faceY:360,faceWidth:260,headTop:80,arms:{'arm-r':{x:300,y:550}}}};
 const before=JSON.stringify(project),point={x:330,y:580};
 for(let t=0;t<4;t+=.13){
  const pose=loopPose(t,{...project.settings,duration:4,headTilt:6,bodyFollow:.3,headNod:4,sway:6,breathe:15,singleBounce:true,bounceHeight:80});
  const screen=pivotScreenPoint(point,project,part,pose),picked=pivotFromScreen(screen,project,part,pose);
  assert.ok(Math.hypot(picked.x-point.x,picked.y-point.y)<.01);
  const draft={...pose,pivotOverrides:{a:{pivotX:point.x,pivotY:point.y}}};
  const owner={...project,deformGroup:'arm-r'};
  assert.ok(segmentOffset(point.x,point.y,owner,draft).every(v=>v===0));
  assert.notDeepEqual(segmentOffset(400,700,owner,draft),segmentOffset(400,700,owner,pose));
 }
 assert.equal(JSON.stringify(project),before);
});
test('ear frequency controls the number of twitches',()=>{
 for(const earCycles of [1,3,6]){
  let starts=0,wasPositive=false;
  for(let i=0;i<3000;i++){const positive=earMotion(i/3000,{earCycles,ears:10}).earAngleL>0;if(positive&&!wasPositive)starts++;wasPositive=positive;}
  assert.equal(starts,earCycles);
 }
});

test('up pop lifts only the chosen ears and uses the same translation in SVG',()=>{
 const settings={duration:4,ears:20,earPattern:'up',earCycles:1};
 const pose=loopPose(.72,settings),part={id:'hat',role:'static',earMotion:true,x:10,y:10,width:80,height:30};
 const project={width:100,height:100,parts:[part]};
 assert.equal(partMotion(part,pose,project).y,-10);
 assert.equal(partMotion(part,pose,project).rotation,0);
 assert.equal(partMotion({...part,earMotion:false},pose,project).y,0);
 assert.equal(channelValue('secondary-shift-hat',pose,project).value,'0 -10');
 assert.equal(partMotion(part,loopPose(2,settings),project).y,0);
 for(const earCycles of [1,3,6]){
  let starts=0,active=false;
  for(let i=0;i<3000;i++){const next=earMotion(i/3000,{...settings,earCycles}).earLift>0;if(next&&!active)starts++;active=next;}
  assert.equal(starts,earCycles);
 }
 const saved=JSON.parse(JSON.stringify(settings));validateMotion(saved);
 assert.deepEqual(loopPose(.72,saved),pose);
});

test('a dragged pivot can stay at the cursor while animation advances',()=>{
 const part={id:'arm',role:'static',deformGroup:'arm-r',x:200,y:500,width:200,height:500};
 const project={width:1024,height:1024,parts:[part],settings:{rigEnabled:true,independentHair:true,rigMode:'stable'},rig:{segmented:true,neckX:512,neckY:530,faceX:512,faceY:360,faceWidth:260,headTop:80,arms:{'arm-r':{x:300,y:550}}}};
 // A browser DOMPoint exposes x/y through accessors, not own enumerable fields.
 const cursor=Object.create({get x(){return 370;},get y(){return 560;}});
 for(let t=0;t<4;t+=.07){const pose=loopPose(t,{duration:4,headTilt:6,sway:6,breathe:10});const point=pivotFromScreen(cursor,project,part,pose),shown=pivotScreenPoint(point,project,part,pose);assert.ok(Math.hypot(shown.x-cursor.x,shown.y-cursor.y)<.01);}
});
test('picked arm pivot updates all sleeve pieces and is shared by mesh and SVG',()=>{
 const parts=[{id:'a',deformGroup:'arm-r',x:20,y:30,width:40,height:60},{id:'b',deformGroup:'arm-r'}];
 const project={width:100,height:100,parts,settings:{armSwing:10},rig:{arms:{'arm-r':{x:20,y:30}}}};
 applyPivot(project,parts,{x:35,y:45});
 assert.deepEqual(project.rig.arms['arm-r'],{x:35,y:45});
 assert.ok(parts.every(p=>p.pivotX===35&&p.pivotY===45));
 const pose={hairPhase:1};
 assert.ok(segmentOffset(35,45,{...project,deformGroup:'arm-r'},pose).every(v=>v===0));
 assert.match(channelValue('svg-arm-a',pose,project,project.settings).value,/ 35 45$/);
 assert.deepEqual(boundedPivot({x:-20,y:200},project),{x:0,y:100});
 const loaded=JSON.parse(JSON.stringify(project));assert.deepEqual(loaded.parts.map(p=>[p.pivotX,p.pivotY]),[[35,45],[35,45]]);
});
