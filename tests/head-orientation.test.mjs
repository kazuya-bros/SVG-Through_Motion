import test from 'node:test';
import assert from 'node:assert/strict';
import {headOrientationPoint,normalizeRig,warpPoint,mesh,triangleMatrix} from '../web/rig.js';
import {channelValue} from '../web/motion.js';
import {jawPoint,faceFilterMatrix,faceGroup} from '../web/face-rig.js';
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
