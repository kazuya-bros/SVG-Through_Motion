import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeDepth,depthHairPoint,depthFaceOffset} from '../web/depth-motion.js';
import {normalizeRig,warpPoint,mesh,triangleMatrix} from '../web/rig.js';
import {featureParallax} from '../web/face-rig.js';
const field={version:1,size:3,values:[.4,.4,.4,.4,.35,.4,.4,.4,.4],median:.4,parts:{front:.15,back:.9,headwear:.14}};
function project(){const p={width:1024,height:1024,parts:[{id:'p001',role:'static',faceBase:true,x:350,y:120,width:330,height:370}],settings:{rigEnabled:true,independentHair:true,depthEnabled:true,depthStrength:1}};p.rig=normalizeRig({faceX:512,faceY:350,faceWidth:330,neckX:512,neckY:500,segmented:true,depth:field},p);return p;}
test('depth survives portable JSON and rig normalization; malformed data is ignored',()=>{
 const p=project(),saved=JSON.parse(JSON.stringify(p));assert.deepEqual(normalizeRig(saved.rig,saved).depth,p.rig.depth);
 for(const bad of [{...field,version:2},{...field,size:66},{...field,values:[1]},{...field,values:Array(9).fill(NaN)},{...field,median:Infinity}])assert.equal(normalizeDepth(bad),undefined);
 const clean=normalizeDepth(field);clean.values[0]=0;assert.equal(field.values[0],.4);
});
test('missing depth, disabled depth, zero gain, and rig off preserve existing motion',()=>{
 const p=project(),base=structuredClone(p);delete base.rig.depth;
 for(const settings of [{depthEnabled:false},{depthStrength:0}])for(const pose of [{yaw:1,pitch:.7},{yaw:-1,pitch:-.7,mouth:1}]){
  const q={...p,settings:{...p.settings,...settings}};
  for(const point of [[350,200],[512,350],[650,460],[512,800]])assert.deepEqual(warpPoint(...point,q,pose),warpPoint(...point,base,pose));
  assert.deepEqual(featureParallax({role:'mouth'},q,pose),featureParallax({role:'mouth'},base,pose));
 }
 const off={...p,settings:{...p.settings,rigEnabled:false}};assert.deepEqual(depthHairPoint(512,200,{...off,deformGroup:'front'},{yaw:1}),[512,200]);
});
test('neutral is unchanged; depth adds face relief and opposite hair parallax',()=>{
 const p=project();assert.deepEqual(depthFaceOffset(512,350,p,{},1),[0,0]);
 assert.ok(depthFaceOffset(512,350,p,{yaw:1},1)[0]>0);
 assert.ok(depthHairPoint(512,200,{...p,deformGroup:'front'},{yaw:1})[0]>512);
 assert.ok(depthHairPoint(512,200,{...p,deformGroup:'back'},{yaw:1})[0]<512);
 const base=structuredClone(p);delete base.rig.depth;
 for(let y=500;y<1024;y+=16)assert.deepEqual(warpPoint(512,y,p,{yaw:1,pitch:1,mouth:1}),warpPoint(512,y,base,{yaw:1,pitch:1,mouth:1}));
 for(const group of ['arm-l','arm-r','tail','bottomwear'])assert.deepEqual(depthHairPoint(512,200,{...p,deformGroup:group},{yaw:1}),[512,200]);
 const neck={role:'static',name:'元画像（胴体・首）',x:0,y:0,width:1024,height:1024};
 for(const y of [350,420,460,499])assert.deepEqual(warpPoint(512,y,{...p,parts:[neck]},{yaw:1,pitch:1}),warpPoint(512,y,{...base,parts:[neck]},{yaw:1,pitch:1}));
});
test('donor blink/mouth state never switches the shared depth field',()=>{
 const p=project(),point=[512,300],open={yaw:.8,pitch:.5,mouth:1,blinkL:0},closed={...open,mouth:0,blinkL:1};
 assert.deepEqual(depthFaceOffset(...point,p,open,1),depthFaceOffset(...point,p,closed,1));
 for(const role of ['lash-l','lash-r','mouth'])assert.deepEqual(featureParallax({role},p,open),{x:0,y:0,sx:1});
});
test('bounded smooth face depth preserves mesh orientation at maximum angles',()=>{
 const p=project();for(const yaw of [-1,1])for(const pitch of [-1,1])for(const t of mesh(p)){
  const [a,b,c,d]=triangleMatrix(t,p,{yaw,pitch,headRoll:8,mouth:1});assert.ok(a*d-b*c>0);
 }
});
