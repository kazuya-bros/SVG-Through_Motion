import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {chestRegion,chestPoint,chestFilter,chestSettings} from '../web/chest-motion.js';
import {applyMotionEdit,validateMotion} from '../web/assist-motion.js';
import {rigGroups,warpPoint,triangleMatrix,mesh} from '../web/rig.js';
import {loopPose,channelValue} from '../web/motion.js';
const sample=JSON.parse(fs.readFileSync(new URL('../web/samples/teth/project.json',import.meta.url),'utf8'));
sample.settings={...sample.settings,independentHair:true,chest:40};
test('Teth2 chest moves locally without a separate chest part; face, waist, hair and arms stay intact',()=>{
 const r=chestRegion(sample);assert.ok(r);
 const groups=rigGroups(sample),body=groups.find(g=>g.parts.some(p=>p.id==='p001')),pose=loopPose(1,{...sample.settings,duration:4});
 assert.ok(chestPoint(r.cx,r.cy,body,pose)[1]>r.cy+10);
 for(const point of [[r.cx,sample.rig.faceY],[r.cx,900],[0,r.cy],[1024,r.cy]])assert.deepEqual(chestPoint(...point,body,pose),point);
 for(const g of groups.filter(g=>g.deformGroup!=='core'))assert.deepEqual(chestPoint(r.cx,r.cy,g,pose),[r.cx,r.cy]);
 assert.deepEqual(chestPoint(r.cx,r.cy,body,{chestOffset:0}),[r.cx,r.cy]);
 assert.ok(warpPoint(r.cx,r.cy,{...body,settings:{rigEnabled:false}},pose)[1]>r.cy);
});
test('maximum chest sway preserves mesh orientation and loop endpoints',()=>{
 const body=rigGroups(sample).find(g=>g.parts.some(p=>p.id==='p001'));
 const s={...sample.settings,duration:4,singleBounce:true,bounceHeight:160};
 assert.deepEqual(loopPose(0,s),loopPose(4,s));
 for(let t=0;t<4;t+=.1)for(const triangle of mesh(body)){const [a,b,c,d]=triangleMatrix(triangle,body,loopPose(t,s));assert.ok(a*d-b*c>.1);}
});
test('separated chest avoids double movement and SVG carries localized displacement',()=>{
 assert.equal(chestRegion({...sample,parts:[...sample.parts,{role:'chest',visible:true}]}),null);
 const svg=chestFilter(sample,'chest-local');assert.match(svg,/feDisplacementMap/);assert.match(svg,/data-channel="svg-chest"/);
 assert.equal(channelValue('svg-chest',{chestOffset:24},sample).value,-48);
});

test('manual region moves the corrected center, stays localized and survives serialization',()=>{
 const original=chestRegion(sample);
 const values={chestRegionManual:true,chestCenterX:.55,chestCenterY:.62,chestRadiusX:.12,chestRadiusY:.08};
 const p=JSON.parse(JSON.stringify(applyMotionEdit(sample,values))),r=chestRegion(p);
 assert.deepEqual(r,{cx:.55*p.width,cy:.62*p.height,rx:.12*p.width,ry:.08*p.height});
 const body=rigGroups(p).find(g=>g.parts.some(v=>v.id==='p001'));
 assert.ok(chestPoint(r.cx,r.cy,body,{chestOffset:40})[1]>r.cy);
 for(const pt of [[r.cx+r.rx+1,r.cy],[r.cx,r.cy-r.ry-1]])assert.deepEqual(chestPoint(...pt,body,{chestOffset:40}),pt);
 const filter=decodeURIComponent(chestFilter(p,'corrected'));
 assert.ok(filter.includes(`cx="${r.cx}" cy="${r.cy}" rx="${r.rx}" ry="${r.ry}"`));
 assert.deepEqual(chestRegion(applyMotionEdit(p,{chestRegionManual:false})),original);
 assert.equal(sample.settings.chestRegionManual,undefined);
});

test('narrow manual regions remain bounded and do not deform face or accessories',()=>{
 const p=applyMotionEdit(sample,{chestRegionManual:true,chestCenterX:.5,chestCenterY:.65,chestRadiusX:.05,chestRadiusY:.01});
 const r=chestRegion(p),body=rigGroups(p).find(g=>g.parts.some(v=>v.id==='p001'));
 assert.ok(chestPoint(r.cx,r.cy,body,{chestOffset:40})[1]-r.cy<=r.ry*.35+.001);
 for(const triangle of mesh(body)){const [a,b,c,d]=triangleMatrix(triangle,body,{chestOffset:40});assert.ok(a*d-b*c>0);}
 for(const flag of ['faceBase','independentAccessory'])assert.equal(chestRegion({...p,parts:[{role:'static',visible:true,x:0,y:0,width:p.width,height:p.height,[flag]:true}]}),null);
 for(const values of [{chestRegionManual:'true'},{chestRadiusX:0},{chestRadiusY:.51},{chestCenterX:NaN},{chestCenterY:-.1}])assert.throws(()=>validateMotion(values));
 assert.equal(chestSettings({chestRadiusX:NaN}).chestRadiusX,.2);
});
