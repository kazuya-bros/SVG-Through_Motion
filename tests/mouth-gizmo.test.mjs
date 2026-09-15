import test from 'node:test';
import assert from 'node:assert/strict';
import {mouthFrame,transformPoint,inversePoint,dragMouth,tuningHistory} from '../web/mouth-gizmo.js';
import {normalizeMouthTuning} from '../web/vowels.js';
const part={x:480,y:400,width:80,height:40};
const s={closedWidth:.8,imageWidth:2048,mouthOffsetY:6,mouthTuning:normalizeMouthTuning({vowels:{i:{angle:25,width:1.2,height:.4,x:5,y:-3}}})};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('mouth handles account for rotation, vowel scale, offset and inverse mapping',()=>{
 const f=mouthFrame(part,s,'i');const center=transformPoint(f.matrix,{x:0,y:0});
 near(center.x,525);near(center.y,429);
 const p={x:40,y:20};const restored=inversePoint(f.matrix,transformPoint(f.matrix,p));near(p.x,restored.x);near(p.y,restored.y);
 const changed=dragMouth(part,s,'i','width',center,transformPoint(f.matrix,{x:60,y:0}));near(changed.vowels.i.width,1.8);near(changed.vowels.i.height,.4);
 const taller=dragMouth(part,s,'i','height',center,transformPoint(f.matrix,{x:0,y:30}));near(taller.vowels.i.height,.6);
 assert.deepEqual(changed.vowels.a,s.mouthTuning.vowels.a);
});
test('closed mouth movement compensates for the existing closed-width transform',()=>{
 const changed=dragMouth(part,s,'closed','move',{x:0,y:0},{x:8,y:5});near(changed.closed.x,10);near(changed.closed.y,5);
 const a=mouthFrame(part,s,'closed').matrix,b=mouthFrame(part,{...s,mouthTuning:changed},'closed').matrix;near(b[4]-a[4],8);near(b[5]-a[5],5);
});
test('teeth dragging uses rotated mouth coordinates and respects limits',()=>{
 const f=mouthFrame(part,s,'i'),a=transformPoint(f.matrix,{x:0,y:0}),b=transformPoint(f.matrix,{x:0,y:4});
 const moved=dragMouth(part,s,'i','teeth-move',a,b);near(moved.vowels.i.teethY,s.mouthTuning.vowels.i.teethY+.1);
 const large=dragMouth(part,s,'i','teeth-width',a,transformPoint(f.matrix,{x:1000,y:0}));assert.equal(large.vowels.i.teethWidth,1);
});
test('undo and redo preserve other shapes and branch after a new gesture',()=>{
 const h=tuningHistory(),a=s.mouthTuning,b=dragMouth(part,s,'i','move',{x:0,y:0},{x:2,y:3});
 h.commit(a,b);assert.deepEqual(h.undo(b),a);assert.deepEqual(h.redo(a),b);
 assert.deepEqual(h.undo(b),a);h.commit(a,normalizeMouthTuning());assert.equal(h.canRedo,false);
});
