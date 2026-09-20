import test from 'node:test';
import assert from 'node:assert/strict';
import {validateMorph,sampleMorph,morphTriangles,featureSignature,activeFeature,invalidateMorph,morphSvg} from '../web/rife-morph.js';
import {channelValue,sceneSvg} from '../web/motion.js';
import {playbackScene} from '../web/character-package.js';
import {activeSequence,activeGrid,sequenceIndex,sequencePart,sequenceBlend,idleEyeWeight,idleEyeProject,stableMouthFeature,mouthPlaybackMode,sequenceMesh,mouthSequenceCrop} from '../web/rife-morph.js';
const part={id:'p000',role:'mouth',mouthMode:'source-open',x:20,y:30,width:80,height:50,svgText:'<path d="M0 0 L80 0 L80 50Z"/>',closedSvgText:'<path d="M0 25L80 25"/>',visible:true,opacity:1};
function fixture(key='mouth'){
  const p={width:200,height:200,name:'Test',parts:[{...part}],settings:{rifeMouth:true,rifeStrength:1}};
  const f={box:[20,30,80,50],anchor:.5,signature:featureSignature(p,key),frames:Array.from({length:5},(_,i)=>{const at=i/4,s=key==='mouth'?.045+.955*at:Math.max(.025,1-at);return {at,ys:Array.from({length:10},(_,n)=>.5+((n<5?0:1)-.5)*s+(i===2?.02*(n%5):0))};})};
  p.rifeMorph={version:1,features:{[key]:f}};return {p,f};
}
test('grid validates bounded finite data and rejects folds and excessive frames',()=>{
  const {p}=fixture();assert.deepEqual(validateMorph(p.rifeMorph),p.rifeMorph);
  for(const mutate of [f=>f.frames[0].ys[0]=Infinity,f=>f.frames[1].ys[5]=-3,f=>f.frames.push(f.frames[0]),f=>f.box[2]=0]){
    const copy=structuredClone(p.rifeMorph);mutate(copy.features.mouth);assert.throws(()=>validateMorph(copy));
  }
});
test('zero strength and exact endpoints retain the original aperture',()=>{
  for(const key of ['mouth','eye-l']){const {f}=fixture(key);
    for(const at of [0,.123,.5,.9,1]){const s=key==='mouth'?.045+.955*at:Math.max(.025,1-at);for(const [n,y] of sampleMorph(f,key,at,0).entries())assert.ok(Math.abs(y-(.5+((n<5?0:1)-.5)*s))<1e-12);}
    for(const at of [0,1])assert.deepEqual(sampleMorph(f,key,at),f.frames[at*4].ys);
  }
});
test('adjacent triangles share transformed vertices, with continuous quarter transitions',()=>{
  const {f}=fixture(),ts=morphTriangles(f,'mouth',.5),vertices=new Map();
  for(const t of ts)for(const [x,y] of t.points){const out=t.b*x+t.d*y+t.f,key=[x,y].join();if(vertices.has(key))assert.ok(Math.abs(vertices.get(key)-out)<1e-10);vertices.set(key,out);}
  for(const at of [.25,.5,.75]){const a=sampleMorph(f,'mouth',at-1e-7),b=sampleMorph(f,'mouth',at+1e-7);assert.ok(a.every((x,i)=>Math.abs(x-b[i])<1e-5));}
});
test('source edits invalidate generation while SVG id changes survive portable reload',()=>{
  const {p}=fixture();assert.ok(activeFeature(p,'mouth'));p.parts[0].svgText+='<path d="M1 2L3 4"/>';invalidateMorph();assert.equal(activeFeature(p,'mouth'),null);
  const a={...p,parts:[{...part,svgText:'<g id="old"><use href="#old"/></g>'}]};const b={...p,parts:[{...part,svgText:'<g id="new"><use href="#new"/></g>'}]};assert.equal(featureSignature(a,'mouth'),featureSignature(b,'mouth'));
});
test('SVG playback uses vector references and the same triangle sampler as Canvas',()=>{
  const {p,f}=fixture(),svg=sceneSvg(p,p.settings,false);assert.match(svg,/rife:mouth:0:shift/);assert.doesNotMatch(svg,/<image|data:image/);
  const triangle=morphTriangles(f,'mouth',.5)[3];const value=channelValue('rife:mouth:3:shift',{mouth:.5},p);assert.equal(value.value,'0 '+(+triangle.f.toFixed(5)));
  assert.equal(channelValue('mouth-native',{mouth:.5},p).value.split(' ')[1],'1');p.settings.rifeMouth=false;assert.equal(morphSvg('x',p,'mouth','qa',p.settings),null);assert.notEqual(channelValue('mouth-native',{mouth:.5},p).value.split(' ')[1],'1');
});
test('external character packages keep the generated grids without sharing mutable state',()=>{
  const {p}=fixture(),scene=playbackScene(p);assert.deepEqual(scene.rifeMorph,p.rifeMorph);scene.rifeMorph.features.mouth.frames[1].ys[0]+=1;assert.notDeepEqual(scene.rifeMorph,p.rifeMorph);
});

test('eight-frame playback blends adjacent frames and retains exact keys',()=>{
  assert.deepEqual([-1,0,.1,.5,.9,1,2].map(sequenceIndex),[0,0,1,4,6,7,7]);
  const {p,f}=fixture();f.svgSize=[80,50];f.svgFrames=Array.from({length:8},(_,i)=>({at:i/7,svgText:`<path d="M0 ${i}L80 ${i}"/>`}));
  p.settings.rifeMouthMode='svg-frames-raw';
  assert.equal(activeSequence(p,'mouth'),f);assert.equal(activeGrid(p,'mouth'),null);
  assert.equal(sequencePart(p,p.parts[0]).owner,true);
  const svg=sceneSvg(p,p.settings,false);assert.equal((svg.match(/data-channel="rife-frame:mouth:/g)||[]).length,8);assert.doesNotMatch(svg,/<image/);
  for(const at of [0,.25,.5,.75,1]){
    const values=Array.from({length:8},(_,i)=>+channelValue(`rife-frame:mouth:${i}`,{mouth:at},p).value);
    assert.equal(values.reduce((a,b)=>a+b),1);assert.ok(values.filter(v=>v>0).length<=2);
  }
  p.settings.rifeMouthMode='grid';assert.equal(activeSequence(p,'mouth'),null);assert.equal(activeGrid(p,'mouth'),f);
  delete f.svgFrames;p.settings.rifeMouthMode='svg-frames';assert.equal(activeGrid(p,'mouth'),f);
});

test('aligned interpolation is continuous across every key and closes onto the endpoint',()=>{
  const {f}=fixture();f.svgFrames=Array.from({length:8},(_,i)=>({bounds:[.1+i*.02,.9-i*.06]}));
  assert.deepEqual(sequenceBlend(f,undefined),[{index:0,weight:1,scale:1,offset:0}]);
  for(let i=0;i<8;i++)assert.deepEqual(sequenceBlend(f,i/7),[{index:i,weight:1,scale:1,offset:0}]);
  for(let i=1;i<8;i++){
    const before=sequenceBlend(f,i/7-1e-8),after=sequenceBlend(f,Math.min(1,i/7+1e-8));
    assert.ok(before.find(v=>v.index===i).weight>1-1e-6);assert.ok(after.find(v=>v.index===i).weight>1-1e-6);
  }
  const entries=sequenceBlend(f,.93),edges=entries.map(e=>f.svgFrames[e.index].bounds.map(v=>v*e.scale+e.offset));
  edges[0].forEach((v,i)=>assert.ok(Math.abs(v-edges[1][i])<1e-12));
});

test('sequence signatures include baked opacity and mouth tuning',()=>{
  const {p}=fixture(),old=featureSignature(p,'mouth'),seq=featureSignature(p,'mouth','svg-frames');
  p.parts[0].opacity=.5;p.settings.closedWidth=.4;
  assert.equal(featureSignature(p,'mouth'),old);assert.notEqual(featureSignature(p,'mouth','svg-frames'),seq);
  for(const frames of [[],new Array(9).fill({}),[{at:0,svgText:''}]]){
    const copy=structuredClone(p.rifeMorph);copy.features.mouth.svgFrames=frames;copy.features.mouth.svgSize=[80,50];assert.throws(()=>validateMorph(copy));
  }
});

test('RIFE eyes retain independent idle gaze without regenerating baked frames',()=>{
  const {p,f}=fixture('eye-l');
  p.settings.rifeEyes=true;
  p.parts=['white-l','iris-l','lash-l'].map((role,i)=>({...part,id:'eye'+i,role}));
  f.signature=featureSignature(p,'eye-l');f.svgSize=[80,50];f.svgFrames=Array.from({length:8},(_,i)=>({at:i/7,svgText:'<path d="M0 0L80 20"/>'}));
  const svg=sceneSvg(p,p.settings,false);
  assert.match(svg,/rife-idle:eye-l\|iris-shift-eye1/);
  assert.equal(channelValue('rife-idle-weight:eye-l',{blinkL:0},p).value,1);
  assert.equal(channelValue('rife-sequence-weight:eye-l',{blinkL:1},p).value,1);
  const left=channelValue('rife-idle:eye-l|iris-shift-eye1',{irisX:-10,irisY:2,blinkL:0},p);
  const right=channelValue('rife-idle:eye-l|iris-shift-eye1',{irisX:10,irisY:2,blinkL:0},p);
  assert.notEqual(left.value,right.value);
  assert.equal(channelValue('rife-idle:eye-l|iris-size-eye1',{irisScale:1.1},p).value,'1.1 1.1');
  assert.equal(idleEyeWeight(0),1);assert.equal(idleEyeWeight(.22),0);assert.equal(idleEyeWeight(1),0);
  assert.ok(idleEyeWeight(.219999)<1e-8);
  const cropped=idleEyeProject(p,'eye-l',true);assert.equal(cropped.parts[0].x,0);assert.equal(cropped.width,80);assert.equal(activeSequence(cropped,'eye-l'),null);
});


test('saved eight-frame mouths play their generated art; endpoint deformation is explicit only',()=>{
 const {p,f}=fixture();f.svgFrames=Array.from({length:8},(_,i)=>({at:i/7,svgText:'<path d="M0 0L1 1"/>'}));f.svgSize=[80,50];
 p.settings.rifeMouthMode='svg-frames';assert.equal(mouthPlaybackMode(p.settings),'svg-frames');assert.equal(activeSequence(p,'mouth'),f);p.settings.rifeMouthMode='stable';
 const stable=activeGrid(p,'mouth');assert.notEqual(stable,f);assert.equal(activeGrid(p,'mouth'),stable);
 p.settings.rifeMouthMode='svg-frames-raw';assert.equal(activeSequence(p,'mouth'),f);
 p.settings.rifeMouthMode='stable';const svg=sceneSvg(p,p.settings,false);assert.doesNotMatch(svg,/rife-frame:mouth:/);assert.match(svg,/rife:mouth:/);
 const triangle=morphTriangles(stable,'mouth',.11)[0];assert.equal(channelValue('rife:mouth:0:shift',{mouth:.11},p).value,'0 '+(+triangle.f.toFixed(5)));
});

test('stable mouth stays monotone even when generated grids barely open until the final key',()=>{
 const {f}=fixture();for(let i=1;i<4;i++)f.frames[i].ys=f.frames[0].ys.map(v=>v+.001*i);
 const stable=stableMouthFeature(f);let previous=0;
 for(let step=0;step<=100;step++){
  const t=step/100,ys=sampleMorph(stable,'mouth',t),height=ys[7]-ys[2];assert.ok(height>=previous-1e-9);previous=height;
  assert.ok(Math.abs(height-(.045+.955*t))<=.08000001);
 }
 for(const at of [0,1])assert.deepEqual(sampleMorph(stable,'mouth',at),f.frames[at*4].ys);
 const height=sampleMorph(stable,'mouth',.11);assert.ok(height[7]-height[2]<.23);
 assert.deepEqual(stableMouthFeature(f),stable);
});


test('corrected RIFE contours retain exact keys, align adjacent silhouettes, and share vertices',()=>{
 const {p,f}=fixture();f.svgSize=[80,50];f.mouthCorrection='alpha-compact-v1';
 f.svgFrames=Array.from({length:8},(_,i)=>({at:i/7,svgText:'<path d="M0 0L1 1"/>',profile:Array.from({length:17},(_,n)=>[.3+.05*Math.sin(n/16*Math.PI),.36+i*.06+.05*Math.sin(n/16*Math.PI)])}));
 assert.equal(activeSequence(p,'mouth'),f);

 for(let i=0;i<8;i++)for(const t of sequenceMesh(f,sequenceBlend(f,i/7)[0])){assert.ok(Math.abs(t.b)<1e-10);assert.ok(Math.abs(t.d-1)<1e-10);assert.ok(Math.abs(t.f)<1e-10);}
 for(const entry of sequenceBlend(f,.11)){
  const vertices=new Map();for(const t of sequenceMesh(f,entry))for(const [x,y] of t.points){const value=t.b*x+t.d*y+t.f,key=[x,y].join();if(vertices.has(key))assert.ok(Math.abs(vertices.get(key)-value)<1e-10);vertices.set(key,value);assert.ok(t.d>0);}
  for(let col=0;col<17;col++)for(let row=0;row<2;row++)assert.ok(Math.abs(vertices.get([col/16,f.svgFrames[entry.index].profile[col][row]].join())-entry.targetProfile[col][row])<1e-10);
 }
 const svg=sceneSvg(p,p.settings,false);assert.match(svg,/rife-contour:mouth:/);assert.doesNotMatch(svg,/rife:mouth:|<image/);
 const entry=sequenceBlend(f,.11)[0],t=sequenceMesh(f,entry)[4];assert.equal(channelValue(`rife-contour:mouth:${entry.index}:4:shift`,{mouth:.11},p).value,`0 ${t.f}`);

});

test('mouth contour metadata cannot be attached to eyes or a grid-only feature',()=>{
 for(const key of ['mouth','eye-l']){const {p,f}=fixture(key);f.mouthCorrection='alpha-compact-v1';if(key==='eye-l')f.svgFrames=[];assert.throws(()=>validateMorph(p.rifeMorph),/口の輪郭補正/);}
});

test('mouth preview crop retains generated vectors and valid source matching without changing the saved project',()=>{
 const {p,f}=fixture();f.svgSize=[80,50];f.svgFrames=Array.from({length:8},(_,i)=>({at:i/7,svgText:`<path d="M0 ${i}L80 ${i}"/>`}));
 const crop=mouthSequenceCrop(p);assert.deepEqual([crop.width,crop.height],[80,50]);assert.deepEqual([crop.parts[0].x,crop.parts[0].y],[0,0]);assert.deepEqual(crop.rifeMorph.features.mouth.box,[0,0,80,50]);
 assert.equal(activeSequence(crop,'mouth'),crop.rifeMorph.features.mouth);assert.equal(crop.rifeMorph.features.mouth.svgFrames,f.svgFrames);
 assert.deepEqual(f.box,[20,30,80,50]);assert.equal(p.parts[0].x,20);assert.equal(p.parts[0].y,30);
});
