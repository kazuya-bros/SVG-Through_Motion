import test from 'node:test';
import assert from 'node:assert/strict';
import {loopPose,blendshapePose,mouthEnvelope,sceneSvg,channelValue,cloneIds,singleHop,mouthScale,partMotion} from '../web/motion.js';
import {zipFiles} from '../web/assets.js';
import {withSampleMouth,sampleMouthSvg} from '../web/sample-mouth.js';

const settings={duration:4,sway:1.2,breathe:3,blink:true,talking:true};
test('tail swings around its saved root, stops at zero and closes the loop',()=>{
 const p={width:1000,height:1000},tail={id:'tail',role:'tail',x:500,y:400,width:300,height:200,pivotX:510,pivotY:510};
 const s={duration:6,tailSwing:12,tailCycles:1};
 const a=partMotion(tail,loopPose(1.5,s),p),b=partMotion(tail,loopPose(4.5,s),p);
 assert.equal(a.rotation,12);assert.equal(b.rotation,-12);
 assert.equal(a.pivotX,510);assert.equal(a.pivotY,510);
 assert.equal(partMotion(tail,loopPose(1.5,{...s,tailSwing:0}),p).rotation,0);
 assert.equal(loopPose(0,s).tailAngle,loopPose(6,s).tailAngle);
 assert.equal(partMotion({...tail,role:'static'},loopPose(1.5,s),p).rotation,0);
 assert.equal(partMotion(tail,{...loopPose(1.5,s),pivotOverrides:{tail:{pivotX:520,pivotY:515}}},p).pivotX,520);
});
test('native mouth has readable closed art and a continuous transition without moving its pivot',()=>{
 const p={width:1024,height:1024,settings:{closedWidth:.8},parts:[{id:'m',role:'mouth',mouthMode:'source-open',x:493,y:396,width:74,height:47,opacity:1,visible:true,svgText:'<svg><path id="open-ink"/></svg>',closedSvgText:'<svg><path id="closed-ink"/></svg>'}]};
 const svg=sceneSvg(p);assert.match(svg,/closed-ink/);assert.match(svg,/translate\(530 419.5\)/);
 for(const mouth of [0,.03,.09,.18,.5,1]){
  const open=channelValue('mouth-native-open',{mouth},p).value,closed=channelValue('mouth-native-closed',{mouth},p).value;
  assert.ok(Math.abs(open+closed-1)<1e-5);assert.ok(open>=0&&closed>=0);
 }
 assert.equal(channelValue('mouth-native-closed',{mouth:0},p).value,1);
 assert.equal(channelValue('mouth-native-open',{mouth:1},p).value,1);
 assert.equal(channelValue('mouth-native-width',{mouth:0},p).value,'0.8 1');
});
test('sample receives its donor without replacing custom mouths or unrelated characters',()=>{
  const project={id:'5838431d4242418baaf2af1fe2177a57',parts:[{name:'mouth',role:'mouth',width:58,height:37,mouthMode:'source-closed'}]};
  assert.equal(withSampleMouth(structuredClone(project)).parts[0].openSvgText,sampleMouthSvg);
  const custom=structuredClone(project);custom.parts[0].openSvgText='<svg/>';assert.equal(withSampleMouth(custom).parts[0].openSvgText,'<svg/>');
  const another=structuredClone(project);another.id='another';assert.equal(withSampleMouth(another).parts[0].openSvgText,undefined);
  const native=structuredClone(project);native.parts[0].mouthMode='source-open';assert.equal(withSampleMouth(native).parts[0].openSvgText,undefined);
});
test('single hop has one ascent, a long rest, delayed follow and seamless endpoints',()=>{
  const s={...settings,duration:3,singleBounce:true,bounceCount:1,bounceHeight:28,hair:5,chest:8,ears:5};
  assert.deepEqual(loopPose(0,s),loopPose(3,s));
  let troughs=0;for(let i=1;i<300;i++)if(singleHop(i/100,3,28)<singleHop((i-1)/100,3,28)&&singleHop(i/100,3,28)<singleHop((i+1)/100,3,28))troughs++;
  assert.equal(troughs,1);assert.equal(singleHop(2,3,28),0);
  assert.ok(Math.abs(loopPose(.84,s).bounce+28)<.01);
  assert.ok(Math.max(...Array.from({length:300},(_,i)=>Math.abs(loopPose(i/100,s).chestOffset)))>1);
  for(const role of ['hair','ear-r','ear-l','chest']){
    const part={role,x:10,y:20,width:30,height:40,motionStrength:0};
    const m=partMotion(part,loopPose(.8,s),{width:100});assert.equal(Math.abs(m.rotation),0);assert.equal(Math.abs(m.y),0);
  }
});
test('native mouth retains original art, narrows closed width, and closed source stays unchanged',()=>{
  assert.deepEqual(mouthScale(0,{closedWidth:.8}),[.8,.045]);assert.deepEqual(mouthScale(1,{closedWidth:.8}),[1,1]);
  const p={name:'mouth',width:100,height:100,parts:[{id:'p0',role:'mouth',x:10,y:20,width:30,height:40,visible:true,opacity:1,svgText:'<svg><path fill="cyan" d="M0 0Z"/></svg>'}]};
  assert.ok(!sceneSvg(p).includes('mouth-open'));
  p.parts[0].mouthMode='source-open';const native=sceneSvg(p);assert.match(native,/mouth-native/);assert.match(native,/fill="cyan"/);assert.ok(!native.includes('#532b2c'));
  assert.equal(channelValue('mouth-native',{mouth:0},p,{closedWidth:.78}).value,'0.78 0.045');
  assert.match(sceneSvg(p,{background:'white'}),/<rect width="100" height="100" fill="white"\/>/);
});
test('closed eyes have no visible iris or eye-white content',()=>{
  for(const side of ['l','r'])assert.equal(channelValue('eye-content-'+side,{blinkL:1,blinkR:1},{}).value,0);
  assert.equal(channelValue('eye-content-l',{blinkL:0},{}).value,1);
});
test('loop has identical endpoints and blink closes then fully reopens',()=>{
  assert.deepEqual(loopPose(0,settings),loopPose(4,settings));
  assert.equal(loopPose(2.88,settings).blinkL,1);
  assert.equal(loopPose(3.2,settings).blinkL,0);
  for(let t=0;t<4;t+=.013){const p=loopPose(t,settings);assert.ok(p.mouth>=0&&p.mouth<=1);assert.ok(p.blinkL>=0&&p.blinkL<=1);}
});
test('left and right blinks independent; lost face decays toward neutral',()=>{
  const p=blendshapePose([{categoryName:'eyeBlinkLeft',score:1},{categoryName:'eyeBlinkRight',score:0},{categoryName:'jawOpen',score:.4}],{},1);
  assert.equal(p.blinkL,1);assert.equal(p.blinkR,0);assert.ok(p.mouth>.8);
  const absent=blendshapePose([],p,.5);assert.ok(absent.blinkL<p.blinkL&&absent.mouth<p.mouth);
});
test('silence closes mouth, loud audio opens, release is smooth',()=>{
  assert.equal(mouthEnvelope(new Float32Array(256)),0);
  const loud=mouthEnvelope(new Float32Array(256).fill(.2),5,0);assert.ok(loud>.6&&loud<=1);
  const release=mouthEnvelope(new Float32Array(256),5,loud);assert.ok(release<loud&&release>0);
});
test('iris clipping uses the eye alpha, IDs are unique in clones, coordinates retained',()=>{
  const sample='<svg xmlns="http://www.w3.org/2000/svg"><defs><mask id="m"><path d="M0 0Z"/></mask></defs><g mask="url(#m)"/></svg>';
  const project={width:100,height:100,name:'<unsafe>',parts:[{id:'p0',name:'white',role:'white-r',x:10,y:20,width:30,height:20,opacity:1,visible:true,svgText:sample},{id:'p1',name:'iris',role:'iris-r',x:16,y:22,width:15,height:15,opacity:1,visible:true,svgText:'<svg xmlns="http://www.w3.org/2000/svg"/>'}]};
  const s=sceneSvg(project,settings);assert.match(s,/translate\(10 20\)/);assert.match(s,/mask="url\(#eye-clip-r\)"/);assert.match(s,/clip-r-m/);assert.match(s,/&lt;unsafe&gt;/);
  assert.equal(channelValue('eye-r',{blinkR:1},project).value,'1 0.025');
  assert.match(cloneIds(sample,'dup-'),/url\(#dup-m\)/);
});
test('ZIP includes correct signatures, UTF-8 flag, entry count and payload',async()=>{
  const blob=zipFiles([['目.svg','<svg/>'],['project.json','{}']]);
  const buffer=await blob.arrayBuffer(),v=new DataView(buffer);
  assert.equal(v.getUint32(0,true),0x04034b50);assert.equal(v.getUint16(6,true),0x800);
  assert.equal(v.getUint32(buffer.byteLength-22,true),0x06054b50);assert.equal(v.getUint16(buffer.byteLength-12,true),2);
  assert.ok(new TextDecoder().decode(buffer).includes('<svg/>'));
});
