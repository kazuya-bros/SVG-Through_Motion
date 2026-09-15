import test from 'node:test';
import assert from 'node:assert/strict';
import {eyeFrame,dragEye} from '../web/eye-gizmo.js';
import {normalizeLid} from '../web/eyelid-controls.js';
import {transformPoint,mouthFrame} from '../web/mouth-gizmo.js';
import {mouthScale,nativeMouthOpenOpacity} from '../web/motion.js';
import {EDIT_EYE_BLEND,EDIT_MOUTH_BLEND} from '../web/work-area.js';
const points=Array.from({length:17},(_,i)=>[i*5,25+Math.sin(i/16*Math.PI)*4]);
const path=[...points.map(([x,y])=>[x,y-2]),...points.toReversed().map(([x,y])=>[x,y+2])];
const part={x:30,y:50,width:80,height:40,closedSvgText:`<svg><path d="M ${path.map(p=>p.join(' ')).join(' L ')} Z"/></svg>`,lidAdjust:{angle:17,width:1.2,curve:3}};
test('eye gestures start without jumping at rotated and adjusted geometry',()=>{
 const f=eyeFrame(part);
 for(const handle of ['move','width','curve','thickness','rotate'])assert.deepEqual(dragEye(part,handle,f.world[0],f.world[0]),normalizeLid(part.lidAdjust));
});
test('eye curve drag follows the rotated local axis and preserves width and position',()=>{
 const f=eyeFrame(part),start=f.world[1],end=transformPoint(f.matrix,{x:f.points[1].x,y:f.points[1].y+4});
 const v=dragEye(part,'curve',start,end);assert.ok(Math.abs(v.curve-7)<1e-8);assert.equal(v.width,1.2);assert.equal(v.x,0);assert.equal(part.lidAdjust.curve,3);
});
test('eye width drag scales from the actual endpoint; movement and limits are bounded',()=>{
 const f=eyeFrame(part),a=f.points[2],end=transformPoint(f.matrix,{x:a.x*1.1,y:a.y});
 assert.ok(Math.abs(dragEye(part,'width',f.world[2],end).width-1.32)<1e-8);
 assert.equal(dragEye(part,'move',{x:0,y:0},{x:500,y:-500}).x,30);
 assert.equal(dragEye(part,'move',{x:0,y:0},{x:500,y:-500}).y,-30);
});
test('optional blend pose shows both forms and closed mouth handles match preview scaling',()=>{
 const opacity=nativeMouthOpenOpacity(EDIT_MOUTH_BLEND),eyeOpacity=(EDIT_EYE_BLEND-.65)/.25;
 assert.ok(opacity>.3&&opacity<.7&&eyeOpacity>.3&&eyeOpacity<.7);
 const s={closedWidth:.8,previewAmount:EDIT_MOUTH_BLEND};assert.equal(mouthFrame(part,s,'closed').cw,mouthScale(EDIT_MOUTH_BLEND,s,{vowel:'a'})[0]);
});
