import test from 'node:test';
import assert from 'node:assert/strict';
import {characterPose} from '../web/character-runtime.js';
import {playbackScene,mapTree} from '../web/character-package.js';
import {loopPose} from '../web/motion.js';
import {sampleMotionSettings} from '../web/natural-motion.js';
import {mouthQuad,alphaBounds} from '../web/mpng-export.js';

test('shared runtime keeps all 180 sample poses; live speech replaces only mouth/vowels',()=>{
 const s=sampleMotionSettings({sway:2,headTilt:3,vowels:true});
 for(let i=0;i<180;i++){
  assert.deepEqual(characterPose(i/30,s),loopPose(i/30,s));
  const live=characterPose(i/30,s,{speech:{active:true,mouth:.6,vowel:'u'}});
  const expected={...loopPose(i/30,{...s,talking:false,vowels:false}),mouth:.6,vowel:'u'};
  assert.deepEqual(live,expected);
 }
 assert.equal(characterPose(1,s,{speech:{active:false,mouth:1}}).mouth,0);
 assert.equal(characterPose(1,s,{speech:{active:true,mouth:5}}).mouth,1);
 assert.deepEqual(Object.values(characterPose(1,s,{blink:{left:1,right:0}})).some(Number.isNaN),false);
});
test('playback scene preserves rig, order, selected source and tuning without voice/history',()=>{
 const original={version:1,id:'a',width:100,height:100,voiceSettings:{secret:'do-not-export'},sourceUrl:'private.png',
  settings:{duration:6,ears:0,bounceDuration:3},rig:{hairWeights:[0,.42,1]},parts:[{id:'b',faceBase:true,role:'static',svgText:'edited',artworkSource:'psd',artworkSources:{psd:{svgText:'selected'},original:{svgText:'unused'}},previousClosedSvgTexts:['old']},{id:'a',earMotion:true}]};
 const p=playbackScene(original);
 assert.equal(p.voiceSettings,undefined);assert.equal(p.sourceUrl,undefined);
 assert.deepEqual(p.parts.map(v=>v.id),['b','a']);assert.deepEqual(p.rig,original.rig);assert.deepEqual(p.settings,original.settings);
 assert.deepEqual(Object.keys(p.parts[0].artworkSources),['psd']);assert.equal(p.parts[0].previousClosedSvgTexts,undefined);
 assert.equal(original.parts[0].artworkSources.original.svgText,'unused');
});
test('asset tree transformations leave numeric settings and embedded XML structure intact',async()=>{
 assert.deepEqual(await mapTree({a:['asset:a',{n:0,s:'<svg href="asset:a"/>'}]},s=>s.replaceAll('asset:a','data:image/png;base64,abc')),
  {a:['data:image/png;base64,abc',{n:0,s:'<svg href="data:image/png;base64,abc"/>'}]});
});
test('MPNG quad uses TL TR BR BL, output scaling and exactly one global movement',()=>{
 const part={id:'mouth',role:'mouth',x:40,y:50,width:20,height:10,visible:true};
 const p={width:100,height:100,parts:[part],settings:{rigEnabled:false}};
 assert.deepEqual(mouthQuad({x:40,y:50,width:20,height:10},part,p,{bounce:-5,breathe:2},{width:200,height:200}),[[80,86],[120,86],[120,106],[80,106]]);
});
test('MPNG sprite bounds include nontransparent pixels across all mouth shapes',()=>{
 const data=new Uint8ClampedArray(20*20*4);data[(5*20+8)*4+3]=1;data[(10*20+12)*4+3]=255;
 assert.deepEqual(alphaBounds([data],20,20),{x:5,y:2,width:11,height:12});
 assert.throws(()=>alphaBounds([new Uint8ClampedArray(16)],2,2),/空/);
});
