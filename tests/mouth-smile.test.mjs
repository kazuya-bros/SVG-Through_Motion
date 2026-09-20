import test from 'node:test';
import assert from 'node:assert/strict';
import {smileGeneratedMouth,closedProfile} from '../web/closed-mouth.js';
const donor=()=>({role:'mouth',mouthMode:'source-open',width:80,height:40,closedSvgText:`<svg xmlns="http://www.w3.org/2000/svg"><path d="${Array.from({length:21},(_,i)=>{const u=i/20;return `${i?'L':'M'}${10+60*u} ${20-8*4*u*(1-u)}`}).join(' ')}" stroke="#654321" stroke-width="2"/></svg>`});
test('untouched generated frown becomes a smile, tilted or edited/PSD donors remain stable',()=>{
 const p=donor();smileGeneratedMouth(p);let q=closedProfile(p.closedSvgText);assert(q.points[10].y>(q.points[0].y+q.points[20].y)/2);const stable=p.closedSvgText;smileGeneratedMouth(p);assert.equal(p.closedSvgText,stable);
 for(const settings of [{mouthTuning:{closed:{curve:2}}},{mouthTuning:{closed:{y:2}}}]){const p=donor(),before=p.closedSvgText;smileGeneratedMouth(p,settings);assert.equal(p.closedSvgText,before);}
 const psd={...donor(),closedSource:'psd'},old=psd.closedSvgText;smileGeneratedMouth(psd);assert.equal(psd.closedSvgText,old);
});
