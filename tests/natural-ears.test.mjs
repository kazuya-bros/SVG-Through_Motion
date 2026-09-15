import test from 'node:test';
import assert from 'node:assert/strict';
import {naturalEarPose,earRegions,naturalEarPoint,naturalEarFilter,earFilterMatrix} from '../web/natural-ears.js';
import {loopPose,partMotion,channelValue} from '../web/motion.js';
import {rigGroups,triangleMatrix,mesh} from '../web/rig.js';
import {validateMotion} from '../web/assist-motion.js';
const part={id:'hat',role:'static',earMotion:true,visible:true,x:280,y:35,width:410,height:200};
const p={width:1024,height:1024,parts:[part],settings:{duration:4,ears:30,earCycles:2,earPattern:'natural'}};
test('natural twitches loop smoothly, differ across sides, and stop at zero',()=>{
 validateMotion(p.settings);
 assert.deepEqual(loopPose(0,p.settings),loopPose(4,p.settings));
 assert.notEqual(naturalEarPose(.2,p.settings).earNaturalL,naturalEarPose(.2,p.settings).earNaturalR);
 for(let i=0;i<1000;i++){
  const pose=naturalEarPose(i/1000,p.settings);
  assert.ok(Object.values(pose).every(v=>Math.abs(v)<15));
  assert.ok(Object.values(naturalEarPose(i/1000,{...p.settings,ears:0})).every(v=>v===0));
 }
 assert.deepEqual(naturalEarPose(.13,p.settings),naturalEarPose(.13,JSON.parse(JSON.stringify(p.settings))));
});
test('both tips move independently on one layer; roots and unselected artwork stay fixed',()=>{
 const regions=earRegions(part,p);assert.equal(regions.length,2);
 const pose={earNaturalL:8,earNaturalR:0};
 for(const r of regions)assert.deepEqual(naturalEarPoint(r.px,r.py,p,pose),[r.px,r.py]);
 const a=regions[0],b=regions[1];
 assert.notDeepEqual(naturalEarPoint(a.cx,part.y+10,p,pose),[a.cx,part.y+10]);
 assert.deepEqual(naturalEarPoint(b.cx,part.y+10,p,pose),[b.cx,part.y+10]);
 const off={...p,parts:[{...part,earMotion:false}]};assert.deepEqual(naturalEarPoint(a.cx,part.y+10,off,pose),[a.cx,part.y+10]);
 assert.ok(partMotion(part,loopPose(.8,p.settings),p).rotation===0);
 const body={id:'body',role:'static',visible:true,x:0,y:0,width:1024,height:1024};
 const groups=rigGroups({...p,parts:[body,part]});assert.equal(groups.length,2);assert.equal(rigGroups(groups[0]),null);
 assert.deepEqual(naturalEarPoint(350,60,groups[0],pose),[350,60]);
});
test('ear deformation remains non-folding at full strength and SVG keeps artwork single',()=>{
 const triangles=mesh(p);
 for(let i=0;i<40;i++)for(const t of triangles){const [a,b,c,d]=triangleMatrix(t,p,loopPose(i/10,p.settings));assert.ok(a*d-b*c>.2);}
 const filter=naturalEarFilter(part,p,'ear-test');assert.equal((filter.match(/feDisplacementMap /g)||[]).length,2);
 assert.ok(!filter.includes('<use'));assert.ok(!filter.includes('NaN'));
 const pose=loopPose(.8,p.settings);assert.equal(channelValue('svg-ear-field-0-hat',pose,p).value,earFilterMatrix(part,p,pose,0));
 const moved=earRegions(part,p,{pivotOverrides:{hat:{pivotX:500,pivotY:240}}});assert.equal(moved[0].py,240);
});

test('maximum ear patterns have comparable travel on a combined headwear layer',()=>{
 const hat={...part,pivotX:485,pivotY:120};
 const travel={};
 for(const earPattern of ['natural','twitch','double','alternate','droop','up']){
  const owner={...p,parts:[hat],settings:{...p.settings,earCycles:1,earPattern}};let peak=0;
  for(let i=0;i<120;i++){
   const pose=loopPose(i/30,owner.settings),m=partMotion(hat,pose,owner),a=m.rotation*Math.PI/180;
   for(let y=hat.y;y<hat.y+hat.height;y+=20)for(let x=hat.x;x<hat.x+hat.width;x+=20){
    const q=earPattern==='natural'?naturalEarPoint(x,y,owner,pose):[m.pivotX+(x-m.pivotX)*Math.cos(a)-(y-m.pivotY)*Math.sin(a)+m.x,m.pivotY+(x-m.pivotX)*Math.sin(a)+(y-m.pivotY)*Math.cos(a)+m.y];
    peak=Math.max(peak,Math.hypot(q[0]-x,q[1]-y));
   }
  }travel[earPattern]=peak;
 }
 assert.ok(travel.natural>18,'MAX must produce a visible tip movement');
 for(const peak of Object.values(travel))assert.ok(peak>=travel.natural*.5&&peak<=travel.natural*1.5,'patterns must share a similar travel range');
});

test('narrow ears and boosted layers remain unfolded while bouncing at MAX',()=>{
 for(const ear of [{...part,role:'ear-l',width:120},{...part,pivotX:485,pivotY:120}]){
  const owner={...p,parts:[{...ear,motionStrength:2}],settings:{...p.settings,earCycles:1,singleBounce:true,bounceHeight:160}},triangles=mesh(owner);
  for(let i=0;i<80;i++)for(const t of triangles){const [a,b,c,d]=triangleMatrix(t,owner,loopPose(i/20,owner.settings));assert.ok(a*d-b*c>.1);}
 }
});
