import test from 'node:test';
import assert from 'node:assert/strict';
import {closedProfile,closedPoints,taperedLine,lipHighlight} from '../web/closed-mouth.js';
import {closedMouthArtwork} from '../web/mouth-controls.js';
import {normalizeMouthTuning,vowelScale} from '../web/vowels.js';
import {mouthFrame,transformPoint,dragMouth} from '../web/mouth-gizmo.js';
import {nativeMouthOpenOpacity,mouthScale,channelValue} from '../web/motion.js';
const svg='<svg><path d="M10 20 L25 22 L40 24 L55 22 L70 20" fill="none" stroke="#302328" stroke-width="2"/></svg>';
const part={x:400,y:300,width:80,height:40,closedSvgText:svg};

test('optional lip highlight follows the tuned curve and survives save/load without altering custom artwork',()=>{
 const profile=closedProfile(svg),off=normalizeMouthTuning().closed;
 assert.equal(lipHighlight(profile,off),'');
 const s={mouthTuning:normalizeMouthTuning({closed:{highlight:true,curve:3,angle:12,left:-4,right:2}})};
 assert.deepEqual(normalizeMouthTuning(JSON.parse(JSON.stringify(s.mouthTuning))),s.mouthTuning);
 const glint=lipHighlight(profile,s.mouthTuning.closed),coords=[...glint.matchAll(/[ML]([\d.-]+) ([\d.-]+)/g)].map(m=>[+m[1],+m[2]]);
 assert.equal(coords.length,34);assert.ok(coords.every(([x,y])=>x>35&&x<45&&Number.isFinite(y)));
 const changed=lipHighlight(profile,{...s.mouthTuning.closed,curve:8});assert.notEqual(glint,changed);
 assert.match(closedMouthArtwork(part,s),/rotate\(12\).*data-lip-highlight/);
 assert.doesNotMatch(closedMouthArtwork({...part,closedSvgText:'<svg><path d="M0 0 Q10 10 20 0"/></svg>'},s),/data-lip-highlight/);
 assert.equal(normalizeMouthTuning({closed:{highlight:'false'}}).closed.highlight,false);
});
test('closed corners and curve are independent and tapered ink retains source color',()=>{
 const profile=closedProfile(svg),t=normalizeMouthTuning({closed:{left:-4,right:2,curve:3}}).closed;
 const points=closedPoints(profile,t);
 assert.equal(points[0].y,16);assert.equal(points.at(-1).y,22);assert.equal(points[2].y,26);
 const path=taperedLine(profile,t);assert.match(path,/fill="#302328"/);assert.ok(!path.includes('NaN'));
 const neutral=normalizeMouthTuning().closed,outline=taperedLine(profile,neutral);
 const coordinates=[...outline.matchAll(/[ML]([\d.-]+) ([\d.-]+)/g)].map(m=>({x:+m[1],y:+m[2]}));
 const thickness=i=>Math.hypot(coordinates[i].x-coordinates[9-i].x,coordinates[i].y-coordinates[9-i].y);
 assert.ok(thickness(0)<thickness(2)/3);
 assert.equal(closedProfile('<svg><path d="M0 0 Q10 10 20 0" stroke="#302328" stroke-width="2"/></svg>'),null);
 assert.equal(closedProfile(svg.replace('<path','<path transform="translate(2 3)"')),null);
});
test('dragging rotated closed corner starts without a jump and preserves the other corner',()=>{
 const settings={closedWidth:.8,mouthTuning:normalizeMouthTuning({closed:{angle:12}})},f=mouthFrame(part,settings,'closed');
 const start=transformPoint(f.matrix,{x:-30,y:0}),end=transformPoint(f.matrix,{x:-36,y:-3});
 assert.deepEqual(dragMouth(part,settings,'closed','corner-left',start,start),settings.mouthTuning);
 const result=dragMouth(part,settings,'closed','corner-left',start,end);
 assert.ok(Math.abs(result.closed.width-1.2)<1e-10);assert.ok(Math.abs(result.closed.left+3)<1e-10);assert.equal(result.closed.right,0);
});
test('simple opening has its own saved shape and near-silence shows no compressed cavity',()=>{
 const settings={vowels:false,mouthTuning:normalizeMouthTuning({open:{width:.9,height:.7}})};
 assert.deepEqual(vowelScale({vowel:'i'},settings),[.9,.7]);
 assert.deepEqual(normalizeMouthTuning(JSON.parse(JSON.stringify(settings.mouthTuning))),settings.mouthTuning);
 assert.equal(nativeMouthOpenOpacity(.03),0);assert.equal(nativeMouthOpenOpacity(.18),1);
 let previous=0;for(let n=0;n<=100;n++){const opacity=nativeMouthOpenOpacity(n/100);assert.ok(opacity>=previous&&opacity<=1);previous=opacity;}
});
test('near-closed correction changes the slit proportions without changing endpoint shapes or SVG export',()=>{
 const baseline={closedWidth:.8},settings={...baseline,mouthTuning:normalizeMouthTuning({transition:{width:.78,height:1.45}})};
 for(const amount of [0,.65,1])assert.deepEqual(mouthScale(amount,settings),mouthScale(amount,baseline));
 const before=mouthScale(.2,baseline),after=mouthScale(.2,settings);
 assert.ok(Math.abs(after[0]/before[0]-.78)<1e-10);assert.ok(Math.abs(after[1]/before[1]-1.45)<1e-10);
 for(const amount of [.19,.2,.35,.65]){
  const scale=mouthScale(amount,settings);
  assert.ok(scale.every(n=>Number.isFinite(n)&&n>0));
  const exported=channelValue('mouth-native',{mouth:amount},{parts:[]},settings);
  assert.deepEqual(exported.value.split(' ').map(Number),scale.map(n=>+n.toFixed(5)));
  const next=mouthScale(amount+.00001,settings);assert.ok(next.every((n,i)=>Math.abs(n-scale[i])<.0001));
 }
 assert.deepEqual(normalizeMouthTuning(JSON.parse(JSON.stringify(settings.mouthTuning))),settings.mouthTuning);
 assert.deepEqual(normalizeMouthTuning({transition:{width:Infinity,height:-10}}).transition,{width:1,height:.5});
 for(const height of [.5,1,1.45,1.6]){let previous=0;for(let i=0;i<=1000;i++){const sy=mouthScale(i/1000,{mouthTuning:{transition:{height}}})[1];assert.ok(sy>=previous,'opening must not shrink backwards');previous=sy;}}
});
