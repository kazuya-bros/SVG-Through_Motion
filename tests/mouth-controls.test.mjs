import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeMouthTuning,vowelScale,vowelWeights} from '../web/vowels.js';
import {closedMouthArtwork,mouthOpenMatrix,mouthTeethOpacity,mouthTeethSvg} from '../web/mouth-controls.js';
import {sceneSvg,channelValue} from '../web/motion.js';
test('vowel edits are independent, bounded and interpolate through speech weights',()=>{
 const tuning=normalizeMouthTuning({vowels:{i:{width:1.5,height:.4,angle:80,teeth:1}}}),s={vowels:true,mouthTuning:tuning};
 assert.equal(tuning.vowels.i.angle,45);
 assert.deepEqual(vowelScale({vowel:'i'},s),[1.5,.4]);
 assert.deepEqual(vowelScale({vowel:'u'},s),[.48,.48]);
 assert.deepEqual(vowelScale({vowelWeights:[0,.5,.5,0,0]},s),[.99,.44]);
 assert.deepEqual(vowelScale({vowel:'i'},{...s,vowels:false}),[1,1]);
 assert.deepEqual(vowelWeights({vowelWeights:[0,-3,NaN,0,0]},s),[0,0,0,0,0]);
 const saved=JSON.parse(JSON.stringify(tuning));assert.deepEqual(normalizeMouthTuning(saved),tuning);
});
test('closed art is reversible and opening transforms pivot at the actual mouth',()=>{
 const p={id:'p004',role:'mouth',mouthMode:'source-open',x:493,y:396,width:74,height:47,visible:true,opacity:1,svgText:'<svg xmlns="http://www.w3.org/2000/svg"/>',closedSvgText:'<svg><path d="M5 23 L37 21 L68 23" stroke-width="1.5"/></svg>',mouthInteriorSvg:'<svg><rect x="8" y="12" width="54" height="25" fill="white"/></svg>'};
 const original=p.closedSvgText,s={vowels:true,mouthTuning:{closed:{angle:-12,width:1.2,curve:3,thickness:2},vowels:{i:{x:4,y:-2,angle:20,teeth:1}}}};
 assert.match(closedMouthArtwork(p,s),/rotate\(-12\)/);assert.match(closedMouthArtwork(p,s),/stroke-width="3"/);assert.equal(p.closedSvgText,original);
 const m=mouthOpenMatrix(p,{mouth:1,vowel:'i'},s),cx=530,cy=419.5;
 assert.ok(Math.abs(m[0]*cx+m[2]*cy+m[4]-cx-4)<1e-9);assert.ok(Math.abs(m[1]*cx+m[3]*cy+m[5]-cy+2)<1e-9);
 const closedMatrix=mouthOpenMatrix(p,{mouth:0,vowel:'i'},s);
 assert.ok(Math.abs(Math.atan2(closedMatrix[1],closedMatrix[0]))<1e-9);
 assert.ok(Math.abs(closedMatrix[0]*cx+closedMatrix[2]*cy+closedMatrix[4]-cx)<1e-9);
 assert.ok(Math.abs(closedMatrix[1]*cx+closedMatrix[3]*cy+closedMatrix[5]-cy)<1e-9);
 assert.equal(mouthTeethOpacity('i',{mouth:1,vowel:'i'},s),1);assert.equal(mouthTeethOpacity('a',{mouth:1,vowel:'i'},s),0);
 assert.match(mouthTeethSvg(p,'i',s),/mask="url\(#teeth-p004-i\)"/);
 const project={width:1024,height:1024,parts:[p],settings:s};assert.match(sceneSvg(project),/mouth-tune-turn-p004/);
 assert.equal(channelValue('mouth-tune-turn-p004',{mouth:1,vowel:'i'},project).type,'rotate');
});

test('moving the closed artwork never moves the compressed source mouth at any opening',()=>{
 const part={id:'p1',role:'mouth',x:100,y:150,width:60,height:30,closedSvgText:'<svg><path d="M5 15 L55 15" stroke="#403030"/></svg>'};
 for(const vowels of [false,true]){
  const base={vowels,mouthTuning:{open:{x:3,y:2,angle:8},vowels:{i:{x:-2,y:4,angle:12}}}};
  const moved={...base,mouthTuning:{...base.mouthTuning,closed:{x:15,y:-10,angle:25}}};
  assert.notEqual(closedMouthArtwork(part,base),closedMouthArtwork(part,moved));
  for(const mouth of [0,.01,.04,.08,.12,.18,.5,1]){
   const pose={mouth,vowel:'i'};
   assert.deepEqual(mouthOpenMatrix(part,pose,moved),mouthOpenMatrix(part,pose,base));
   for(const kind of ['shift','turn'])assert.deepEqual(
    channelValue(`mouth-tune-${kind}-p1`,pose,{parts:[part],settings:moved}),
    channelValue(`mouth-tune-${kind}-p1`,pose,{parts:[part],settings:base}));
  }
 }
});
