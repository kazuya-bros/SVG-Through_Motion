import test from 'node:test';
import assert from 'node:assert/strict';
import {headOrientationPoint,normalizeRig,warpPoint,mesh,triangleMatrix} from '../web/rig.js';
import {channelValue} from '../web/motion.js';
import {jawPoint,faceFilterMatrix,faceGroup,headAttachmentMatrix} from '../web/face-rig.js';
import {rigGroups} from '../web/rig.js';
const p={width:1024,height:1024,parts:[],settings:{rigEnabled:true,independentHair:true}};
p.rig=normalizeRig({faceX:518,faceY:373,faceWidth:305,neckX:518,neckY:517,segmented:true},p);
test('face XYZ moves the face base while leaving hair, accessories and neck in place',()=>{
  for(const pose of [{yaw:1},{yaw:-1},{pitch:1},{pitch:-1},{headRoll:8}]){
    for(const point of [[380,373],[650,373],[450,230]]){
      const q=warpPoint(...point,p,pose);
      assert.ok(Math.hypot(q[0]-point[0],q[1]-point[1])>1);
      assert.deepEqual(warpPoint(...point,{...p,deformGroup:'core'},pose),q);
      for(const deformGroup of ['front','back','arm-r'])assert.deepEqual(warpPoint(...point,{...p,deformGroup},pose),point);
      const accessory={...p,deformGroup:'core',parts:[{role:'static',independentAccessory:true}]};
      assert.equal(faceGroup(accessory),false);assert.deepEqual(warpPoint(...point,accessory,pose),point);
    }
    assert.deepEqual(warpPoint(518,p.rig.neckY,p,pose),[518,p.rig.neckY]);
    assert.deepEqual(warpPoint(518,800,p,pose),[518,800]);
  }
});
test('neutral is unchanged; opposite views are symmetric about the face center',()=>{
  for(const [x,y] of [[380,200],[518,373],[650,460],[518,800]]){
    assert.deepEqual(headOrientationPoint(x,y,p,{}),[x,y]);
    const a=headOrientationPoint(x,y,p,{yaw:1}),b=headOrientationPoint(1036-x,y,p,{yaw:-1});
    assert.ok(Math.abs(a[0]+b[0]-1036)<1e-8);
  }
});
test('combined maximum orientation, roll and nod never fold the mesh',()=>{
  for(const yaw of [-1,0,1])for(const pitch of [-1,0,1])for(const headRoll of [-8,8]){
    for(const t of mesh(p)){const [a,b,c,d]=triangleMatrix(t,p,{yaw,pitch,headRoll,nod:6});assert.ok(a*d-b*c>.5);}
  }
});
test('lightweight SVG carries local face XYZ and speech jaw channels',()=>{
  for(const pose of [{yaw:1},{pitch:1},{headRoll:8}])assert.notEqual(faceFilterMatrix(p,pose),faceFilterMatrix(p,{}));
  assert.equal(channelValue('svg-face-matrix',{yaw:1},p).attribute,'values');
  assert.equal(channelValue('svg-face-jaw',{mouth:0},p).value,0);
  assert.ok(channelValue('svg-face-jaw',{mouth:1},p).value<0);
});
const globalFace=p;

test('separate head artwork follows orientation, keeps local hair sway and leaves torso and arms alone',()=>{
 const parts=[{id:'back',role:'static',deformGroup:'back'},{id:'body',role:'static'},
  {id:'front',role:'static',deformGroup:'front'},{id:'headwear',role:'static',independentAccessory:true,name:'headwear'},
  {id:'glasses',role:'glasses'},{id:'ear',role:'ear-l'},{id:'arm',role:'static',deformGroup:'arm-l'}].map(v=>({...v,visible:true,x:200,y:100,width:600,height:800}));
 const scene={...p,parts,settings:{...p.settings,frontHair:4,backHair:9,armSwing:0}},groups=rigGroups(scene);
 for(const id of ['back','front','headwear','glasses','ear']){
  const group=groups.find(g=>g.parts.some(v=>v.id===id));
  assert.deepEqual(warpPoint(518,300,group,{}),[518,300]);
  for(const pose of [{yaw:.8},{pitch:.8},{headRoll:6}])assert.ok(Math.hypot(...warpPoint(518,300,group,pose).map((v,i)=>v-[518,300][i]))>1,id);
  for(const pose of [{yaw:1,pitch:1,headRoll:8},{yaw:-1,pitch:-1,headRoll:-8}]){
   const m=headAttachmentMatrix(group,pose);assert.ok(m[0]*m[3]-m[1]*m[2]>.99);
   const q=warpPoint(518,300,group,pose);assert.ok(Math.hypot(q[0]-(m[0]*518+m[2]*300+m[4]),q[1]-(m[1]*518+m[3]*300+m[5]))<1e-8);
  }
 }
 for(const id of ['body','arm'])assert.deepEqual(warpPoint(518,800,groups.find(g=>g.parts.some(v=>v.id===id)),{yaw:1,pitch:1,headRoll:8}),[518,800]);
 const hair=groups.find(g=>g.deformGroup==='back');assert.notDeepEqual(warpPoint(300,800,hair,{yaw:.5,hairPhase:1}),warpPoint(300,800,hair,{yaw:.5,hairPhase:2}));
});
test('speech lowers only the lower face and closes without residual deformation',()=>{
 const p={...globalFace,parts:[{faceBase:true,role:'static',x:360,y:120,width:310,height:355}]};
 const chin=[518,475];
 const a=jawPoint(...chin,p,{mouth:1}),b=jawPoint(...chin,p,{mouth:.5});
 assert.ok(a[1]>chin[1]&&a[1]-chin[1]<=6);assert.ok(Math.abs((a[1]-chin[1])/2-(b[1]-chin[1]))<1e-8);
 for(const point of [[518,350],[518,p.rig.neckY],[518,800]])assert.deepEqual(jawPoint(...point,p,{mouth:1}),point);
 for(const deformGroup of ['front','back'])assert.deepEqual(jawPoint(...chin,{...p,deformGroup},{mouth:1}),chin);
 assert.deepEqual(jawPoint(...chin,p,{mouth:0}),chin);
 // The same points in an old merged body, neck, or topwear never receive speech motion.
 for(const name of ['元画像（胴体・顔の下地）','neck','topwear']){const body={...p,parts:[{role:'static',name,x:0,y:0,width:1024,height:1024}]};for(const q of [chin,[518,490],[518,520]])assert.deepEqual(jawPoint(...q,body,{mouth:1}),q);}
});
