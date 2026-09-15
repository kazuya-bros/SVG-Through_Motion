import test from 'node:test';
import assert from 'node:assert/strict';
import {resizeBox} from '../web/transform-box.js';
import {eyeFrame,dragEye} from '../web/eye-gizmo.js';
import {mouthFrame,dragMouth,transformPoint} from '../web/mouth-gizmo.js';
import {normalizeLid,closedLashArtwork} from '../web/eyelid-controls.js';
import {normalizeMouthTuning} from '../web/vowels.js';
import {closedMouthArtwork} from '../web/mouth-controls.js';
const b={left:-25,right:35,top:-8,bottom:12};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('rotated corner resize preserves opposite anchor and aspect; Shift frees axes',()=>{
 const m=[1.1,.4,-.3,.9,50,80],start=transformPoint(m,{x:b.right,y:b.bottom}),end=transformPoint(m,{x:47,y:16});
 const r=resizeBox(m,b,'box-se',start,end);near(r.sx,r.sy);
 const before=transformPoint(m,{x:b.left,y:b.top});
 const after=transformPoint([m[0]*r.sx,m[1]*r.sx,m[2]*r.sy,m[3]*r.sy,m[4]+r.x,m[5]+r.y],{x:b.left,y:b.top});near(before.x,after.x);near(before.y,after.y);
 const free=resizeBox(m,b,'box-se',start,transformPoint(m,{x:47,y:20}),{free:true});assert.notEqual(free.sx,free.sy);
});
test('Alt scales around center and crossing anchor cannot flip or collapse',()=>{
 const m=[1,0,0,1,0,0],start={x:b.right,y:b.bottom};
 const r=resizeBox(m,b,'box-se',start,{x:50,y:17},{center:true});near((b.left+b.right)/2*r.sx+r.x,(b.left+b.right)/2);near((b.top+b.bottom)/2*r.sy+r.y,(b.top+b.bottom)/2);
 const crossed=resizeBox(m,b,'box-e',start,{x:-500,y:0},{minX:.4});near(crossed.sx,.4);near(crossed.sy,1);
});
test('eye and mouth box drags have no initial jump and preserve other tuning',()=>{
 const part={x:100,y:100,width:60,height:40,lidAdjust:{angle:12,height:1.3,width:1.1},closedSvgText:'<svg><path d="M0 20L60 22"/></svg>'};
 const f=eyeFrame(part),start=transformPoint(f.matrix,{x:b.right,y:b.bottom});assert.deepEqual(dragEye(part,'box-se',start,start,{bounds:b}),normalizeLid(part.lidAdjust));
 const settings={previewAmount:.11,closedWidth:.8,mouthTuning:{closed:{angle:15,width:1.2,height:1.4},vowels:{i:{x:5}}}},mf=mouthFrame(part,settings,'closed'),p=transformPoint(mf.matrix,{x:b.right,y:b.bottom});
 assert.deepEqual(dragMouth(part,settings,'closed','box-se',p,p,{bounds:b}),normalizeMouthTuning(settings.mouthTuning));
 const end=transformPoint(mf.matrix,{x:41,y:14}),v=dragMouth(part,settings,'closed','box-se',p,end,{bounds:b});assert.deepEqual(v.vowels,normalizeMouthTuning(settings.mouthTuning).vowels);
 const anchor={x:b.left,y:b.top},old=transformPoint(mf.matrix,anchor),next=transformPoint(mouthFrame(part,{...settings,mouthTuning:v},'closed').matrix,anchor);near(old.x,next.x);near(old.y,next.y);
});
test('closed shape height survives normalization and is applied to exported artwork',()=>{
 const part={width:60,height:40,closedSvgText:'<svg><path d="M0 20L60 22"/></svg>',lidAdjust:{height:1.7}};
 assert.match(closedLashArtwork(part),/scale\(1 1.7\)/);assert.match(closedMouthArtwork(part,{mouthTuning:{closed:{height:1.6}}}),/scale\(1 1.6\)/);
 assert.equal(normalizeLid({}).height,1);assert.equal(normalizeMouthTuning().closed.height,1);
});
