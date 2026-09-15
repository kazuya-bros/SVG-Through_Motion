import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeRig,rigGroups,segmentOffset,warpPoint,mesh,triangleMatrix,rigPose} from '../web/rig.js';
import {restrainedDefaults} from '../web/pachipaku-motion.js';
import {sceneSvg,channelValue} from '../web/motion.js';
const settings={...restrainedDefaults,duration:4,rigEnabled:true,armSwing:2,frontHair:6,backHair:18,hairMethod:'wave'};
test('local hair region pins above root and outside band, and lets tips move',()=>{
 const p=fixture(),g=rigGroups(p)[0];g.parts[0].hairControl={rootY:400,tipY:950,centerX:800,radius:180};
 assert.deepEqual(segmentOffset(800,390,g,{hairPhase:1}),[0,0]);
 assert.deepEqual(segmentOffset(500,950,g,{hairPhase:1}),[0,0]);
 let tip=0,middle=0;for(let i=0;i<60;i++){const pose={hairPhase:i/60*Math.PI*2};tip=Math.max(tip,Math.abs(segmentOffset(800,950,g,pose)[0]));middle=Math.max(middle,Math.abs(segmentOffset(800,675,g,pose)[0]));}
 assert.ok(tip>middle*2&&tip<=18);
 const restored=JSON.parse(JSON.stringify(p));assert.deepEqual(restored.parts[0].hairControl,g.parts[0].hairControl);
});
function fixture(){const p={width:1024,height:1024,settings:{...settings},parts:['back','core','arm-r','arm-l','core','front'].map((g,i)=>({id:'p'+i,role:'static',deformGroup:g,x:0,y:0,width:1024,height:1024,visible:true,opacity:1,svgText:'<svg><path d="M 0 0 L 10 0 L 10 10 Z" fill="red"/></svg>'}))};p.rig=normalizeRig({segmented:true,neckX:512,neckY:510,headTop:50,arms:{'arm-r':{x:330,y:540},'arm-l':{x:700,y:540}}},p);return p;}
test('groups retain paint order and receive live settings after sliders replace settings',()=>{
 const p=fixture(),groups=rigGroups(p);assert.deepEqual(groups.map(g=>g.deformGroup),['back','core','arm-r','arm-l','core','front']);
 p.settings={...p.settings,backHair:0};assert.equal(groups[0].settings.backHair,0);
 assert.equal(groups[0].settings.background,'transparent');
 const restored={...p,rig:normalizeRig(JSON.parse(JSON.stringify(p.rig)),p)};assert.deepEqual(restored.rig.arms,p.rig.arms);
});
test('arm rotates about shoulder without stretching; off and zero controls really stop motion',()=>{
 const p=fixture(),g=rigGroups(p)[2],pose={hairPhase:1.6};
 assert.ok(segmentOffset(330,540,g,pose).every(v=>Math.abs(v)<1e-12));
 const a=[360,760],b=[380,950],da=segmentOffset(...a,g,pose),db=segmentOffset(...b,g,pose);
 assert.ok(Math.abs(Math.hypot(a[0]+da[0]-b[0]-db[0],a[1]+da[1]-b[1]-db[1])-Math.hypot(a[0]-b[0],a[1]-b[1]))<1e-9);
 p.settings.armSwing=0;assert.deepEqual(segmentOffset(...a,g,pose),[0,0]);
 p.settings.hairMethod='off';assert.deepEqual(segmentOffset(800,950,rigGroups(p)[0],pose),[0,0]);
});
test('front/back hair are independent, roots pinned, tips stronger, methods exclusive and periodic',()=>{
 const p=fixture(),[back,,,,,front]=rigGroups(p);
 for(const method of ['wave','spring']){p.settings.hairMethod=method;let root=0,middle=0,tip=0;
  for(let i=0;i<120;i++){const phase=i/120*Math.PI*2,pose={hairPhase:phase};
   root=Math.max(root,Math.abs(segmentOffset(800,50,back,pose)[0]));middle=Math.max(middle,Math.abs(segmentOffset(800,400,back,pose)[0]));tip=Math.max(tip,Math.abs(segmentOffset(800,1024,back,pose)[0]));
   assert.ok(Math.abs(segmentOffset(800,1024,back,pose)[0]-segmentOffset(800,1024,back,{hairPhase:phase+Math.PI*2})[0])<1e-9);
  }assert.equal(root,0);assert.ok(tip>middle*2&&tip<=18);
 }
 p.settings.frontHair=0;assert.deepEqual(segmentOffset(600,450,front,{hairPhase:1}),[0,0]);
 p.settings.hairMethod='wave';const wave=segmentOffset(800,950,back,{hairPhase:1})[0];
 p.settings.hairMethod='spring';assert.notEqual(segmentOffset(800,950,back,{hairPhase:1})[0],wave);
 // Segmented core never receives either hair field.
 for(const g of rigGroups(p).filter(g=>g.deformGroup==='core'))assert.deepEqual(warpPoint(500,700,g,{hairPhase:1}),[500,700]);
});
test('all segmented meshes stay finite without foldover at slider extremes',()=>{
 const p=fixture();
 p.settings={...p.settings,headTilt:16,headNod:24,bodyFollow:1,hairBend:30,frontHair:40,backHair:70,armSwing:10};
 for(const method of ['wave','spring'])for(const duration of [1,4,30]){p.settings.hairMethod=method;p.settings.duration=duration;
  for(let i=0;i<12;i++)for(const g of rigGroups(p))for(const t of mesh(g)){
   const m=triangleMatrix(t,g,rigPose(i/12*duration,p.settings));assert.ok(m.every(Number.isFinite));assert.ok(m[0]*m[3]-m[1]*m[2]>.3);
  }
 }
});
test('SVG uses isolated groups, globally unique IDs, and arm group channel resolves its own mesh',()=>{
 const p=fixture(),svg=sceneSvg(p),ids=[...svg.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size);
 assert.match(svg,/data-channel="group2:mesh-0-translate"/);
 const value=channelValue('group2:mesh-0-translate',{hairPhase:1},p);assert.equal(value.type,'translate');assert.ok(value.value.split(' ').every(v=>Number.isFinite(+v)));
});
test('shared seam field renders all cutouts through one mesh and preserves every shared edge',()=>{
 const p=fixture();p.rig.seamWeights={size:2,front:[0,1,0,0],back:[1,0,0,.5],'arm-r':[0,0,1,0],'arm-l':[0,0,0,.5]};
 assert.equal(rigGroups(p),null);
 const svg=sceneSvg(p);assert.doesNotMatch(svg,/data-channel="group/);assert.equal((svg.match(/data-channel="mesh-\d+-translate"/g)||[]).length,432);
 for(const method of ['wave','spring']){p.settings.hairMethod=method;
  for(let i=0;i<24;i++){const pose=rigPose(i/6,p.settings),vertices=new Map();
   for(const t of mesh(p)){const [a,b,c,d,e,f]=triangleMatrix(t,p,pose);assert.ok(a*d-b*c>.3);
    for(const [x,y] of t){const q=[a*x+c*y+e,b*x+d*y+f],key=x+','+y;
     if(vertices.has(key)){const v=vertices.get(key);assert.ok(Math.hypot(q[0]-v[0],q[1]-v[1])<1e-8);}else vertices.set(key,q);
    }
   }
  }
 }
 const restored=normalizeRig(JSON.parse(JSON.stringify(p.rig)),p);assert.deepEqual(restored.seamWeights,p.rig.seamWeights);
});
test('shared seams retain nonzero independent hair and arm controls instead of suppressing motion',()=>{
 const p=fixture(),zero=[0,0,0,0],one=[1,1,1,1];
 p.rig.seamWeights={size:2,front:zero,back:one,'arm-r':zero,'arm-l':zero};
 const before=warpPoint(800,1000,p,{hairPhase:1});p.settings.backHair=0;
 assert.deepEqual(warpPoint(800,1000,p,{hairPhase:1}),[800,1000]);assert.ok(Math.abs(before[0]-800)>.5);
 p.rig.seamWeights.back=zero;p.rig.seamWeights['arm-r']=one;
 assert.ok(Math.hypot(...warpPoint(350,950,p,{hairPhase:1}).map((v,i)=>v-[350,950][i]))>5);
 p.settings.armSwing=0;assert.deepEqual(warpPoint(350,950,p,{hairPhase:1}),[350,950]);
});

test('independent hair isolates front/back and protects the core even with shared legacy weights',()=>{
 const p=fixture();p.settings={...p.settings,independentHair:true,frontHairMethod:'spring',backHairMethod:'wave',frontHairCycles:1,backHairCycles:2};
 const one=[1,1,1,1];p.rig.seamWeights={size:2,front:one,back:one,'arm-r':one,'arm-l':one};
 const [back,core,,,,front]=rigGroups(p),pose={hairPhase:1};
 const before=warpPoint(800,950,back,pose),bangs=warpPoint(600,450,front,pose);
 p.settings.frontHair=40;p.settings.frontHairMethod='wave';p.settings.frontHairCycles=4;
 assert.deepEqual(warpPoint(800,950,back,pose),before);assert.deepEqual(warpPoint(500,370,core,pose),[500,370]);
 assert.notDeepEqual(warpPoint(600,450,front,pose),bangs);
 p.settings.backHair=0;assert.deepEqual(warpPoint(800,950,back,pose),[800,950]);
 assert.ok(rigGroups(JSON.parse(JSON.stringify(p))));
});
