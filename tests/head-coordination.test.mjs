import test from 'node:test';
import assert from 'node:assert/strict';
import {coordinatedHeadPoint,executeHeadMotion,headTuning,headSettings,coordinatedWeight} from '../web/head-coordination.js';
import {rigPose,rigGroups,warpPoint,mesh,triangleMatrix} from '../web/rig.js';
import {featureParallax} from '../web/face-rig.js';
const make=()=>({width:1024,height:1024,rig:{neckX:512,neckY:500,faceX:512,faceY:330,faceWidth:300,headTop:90,segmented:true},settings:{rigEnabled:true,faceCoordination:true,independentHair:true},parts:[{id:'p000',name:'Face',faceBase:true},{id:'p001',deformGroup:'front'},{id:'p002',name:'body'},{id:'p003',name:'eyewear',independentAccessory:true},{id:'p004',role:'iris-l'},{id:'p005',role:'lash-l'},{id:'p006',role:'white-l'}].map(v=>({role:'static',visible:true,x:300,y:100,width:400,height:800,...v}))});
test('equal tuning shares a neck projection; zero follow stays fixed and torso follows gently',()=>{
 const p=make();for(const part of p.parts)part.headFollow={amount:1,depth:1};const groups=rigGroups(p),pose={yaw:.8,pitch:.7,headRoll:6};
 const face=groups.find(g=>g.parts[0].id==='p000'),hair=groups.find(g=>g.parts[0].id==='p001');
 assert.deepEqual(warpPoint(450,300,face,pose),warpPoint(450,300,hair,pose));
 face.parts[0].headFollow.amount=0;assert.deepEqual(warpPoint(450,300,face,pose),[450,300]);
 const body=groups.find(g=>g.parts[0].id==='p002');assert.equal(coordinatedWeight(512,800,body),.16);assert.notDeepEqual(warpPoint(512,460,body,pose),[512,460]);
});
test('eye components remain aligned, feature parallax is not applied twice, and depth affects opposite views',()=>{
 const p=make();for(const v of p.parts.filter(v=>/^(iris|lash|white)/.test(v.role)))v.headFollow={amount:.8,depth:1.2};
 const points=p.parts.slice(4).map(part=>coordinatedHeadPoint(470,330,{...p,parts:[part]},{yaw:.8,pitch:.5}));assert.deepEqual(points[0],points[1]);assert.deepEqual(points[1],points[2]);
 assert.deepEqual(featureParallax(p.parts[4],p,{yaw:1}),{x:0,y:0,sx:1});
 const q={...p,parts:[p.parts[4]]};const a=coordinatedHeadPoint(470,330,q,{yaw:1}),b=coordinatedHeadPoint(470,330,q,{yaw:-1});assert.ok(Math.abs(a[0]+b[0]-940)<1e-8);
});
test('maximum face poses keep positive mesh orientation including the neck blend',()=>{
 for(const amount of [0,1])for(const depth of [.5,1.4])for(const blend of [.15,.6]){const p=make();p.settings.faceNeckBlend=blend;for(const part of p.parts)part.headFollow={amount,depth};
  for(const g of rigGroups(p))for(const yaw of [-1,1])for(const pitch of [-1,1])for(const t of mesh(g)){const [a,b,c,d]=triangleMatrix(t,g,{yaw,pitch,headRoll:8,nod:6});assert.ok(a*d-b*c>0.1);}
 }
});
test('head command is atomic, detects conflicts and preserves parent links and serialized tuning',()=>{
 const p=make(),before=executeHeadMotion(p,{operation:'inspect'});p.parts[3].motionLink='p000';p.parts[3].motionLinkMode='attachment';
 assert.throws(()=>executeHeadMotion(p,{operation:'update',part_ids:['p000','p003'],tuning:{amount:.5,depth:1}}));assert.equal(p.parts[0].headFollow,undefined);
 assert.throws(()=>executeHeadMotion(p,{operation:'update',enabled:false,expected_revision:before.revision}));
 const command={operation:'update',part_ids:['p004','p005','p006'],tuning:{amount:.7,depth:1.1}};assert.equal(executeHeadMotion(p,command).changed,true);assert.equal(executeHeadMotion(p,command).changed,false);
 const saved=JSON.parse(JSON.stringify(p));assert.deepEqual(headTuning(saved.parts[4]),{amount:.7,depth:1.1});assert.equal(saved.parts[3].motionLink,'p000');
 executeHeadMotion(p,{operation:'reset',part_ids:['p004','p005','p006']});assert.equal(p.parts[4].headFollow,undefined);
});

test('linked eyewear receives the parent projection once and overlays share the owner tuning',()=>{
 const p=make();p.parts[3].motionLink='p000';p.parts[3].motionLinkMode='attachment';p.parts.push({...p.parts[5],id:'p007',role:'static',blinkOverlay:'l'});
 executeHeadMotion(p,{operation:'update',part_ids:['p005'],tuning:{amount:.6,depth:1.1}});assert.deepEqual(p.parts[7].headFollow,p.parts[5].headFollow);
 const gs=rigGroups(p),face=gs.find(g=>g.parts[0].id==='p000'),glass=gs.find(g=>g.parts[0].id==='p003'),pose={yaw:.8,pitch:.5,headRoll:5};
 assert.deepEqual(warpPoint(500,500,glass,pose),warpPoint(500,500,face,pose));
});

test('automatic head uses reference hair depths and subtler body follow',()=>{
 const p=make();assert.equal(headTuning({deformGroup:'front'}).depth,1.28);assert.equal(headTuning({deformGroup:'back'}).depth,.55);
 assert.equal(headTuning({sourceLayerName:'headwear'}).depth,1.2);assert.equal(headTuning({role:'glasses'}).depth,1.18);
 const ref=(x,y,depth,weight,yaw,pitch)=>{const fs=300/333;return [x+weight*fs*yaw*(14+40*(depth-1)+(500-y)*.028),y-weight*fs*pitch*(9+30*(depth-1)+(depth-1)*(y-330)*.05)];};
 for(const part of [{deformGroup:'front'},{deformGroup:'back'},{faceBase:true},{sourceLayerName:'headwear'},{sourceLayerName:'bottomwear',role:'static'}]){
  const group={...p,parts:[part]},w=coordinatedWeight(510,360,group),depth=headTuning(part).depth;
  for(const yaw of [-1,0,1])for(const pitch of [-1,0,1])assert.deepEqual(coordinatedHeadPoint(510,360,group,{yaw,pitch}),ref(510,360,depth,w,yaw,pitch));
 }
});
test('saved face angles drive loop poses and head idle can be stopped independently',()=>{
 const original={faceCoordination:false,headYawOffset:.6,headPitch:-.4,headRollOffset:3,headIdle:false};const s=headSettings(original);
 assert.equal(original.faceCoordination,false);assert.equal(s.faceCoordination,true);assert.equal(headSettings({...s,faceCoordination:false}).faceCoordination,false);
 for(const t of [0,1,2,3]){const p=rigPose(t,{...s,duration:4,headYaw:1,headTilt:8,headNod:6,pitchSway:1});assert.equal(p.yaw,.6);assert.equal(p.pitch,-.4);assert.equal(p.headRoll,3);assert.ok(p.nod===0);}
 assert.deepEqual(headSettings(JSON.parse(JSON.stringify(s))),s);
});
