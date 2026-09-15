import test from 'node:test';
import assert from 'node:assert/strict';
import {animeMouth,mouthOffset} from '../web/anime-mouth.js';
import {channelValue,sceneSvg,loopPose} from '../web/motion.js';

test('anime contours morph continuously with one topology, preserve silence and hide teeth in round mouths',()=>{
  const samples=['a','i','u','e','o'].map(v=>animeMouth({mouth:1,vowel:v},{vowels:true}));
  assert.equal(new Set(samples.map(v=>v.outline)).size,5);
  assert.equal(new Set(samples.map(v=>v.outline.replace(/[-.\d]+/g,''))).size,1);
  assert.equal(samples[2].teethOpacity,0);assert.equal(samples[4].teethOpacity,0);assert.equal(samples[1].teethOpacity,1);
  assert.equal(animeMouth({mouth:0}).opacity,0);
  assert.deepEqual(animeMouth({mouth:1,vowel:'i'},{vowels:false}),animeMouth({mouth:1,vowel:'a'},{vowels:false}));
  const settings={vowels:true,duration:4};assert.deepEqual(animeMouth(loopPose(0,settings),settings),animeMouth(loopPose(4,settings),settings));
});
test('mouth position uses image scale and moves both open and closed art in SVG',()=>{
  assert.equal(mouthOffset({mouthOffsetY:6},1024),6);assert.equal(mouthOffset({mouthOffsetY:6},2048),12);
  const part={id:'p0',role:'mouth',name:'mouth',x:100,y:100,width:50,height:30,visible:true,opacity:1,svgText:'<path d="M0 0L2 2"/>',mouthMode:'synthetic'};
  const p={width:1024,height:1024,parts:[part],settings:{mouthStyle:'anime',mouthOffsetY:6}};
  const svg=sceneSvg(p);assert.ok(svg.includes('anime-outline'));assert.ok(svg.includes('mouth-closed'));
  assert.deepEqual(channelValue('mouth-position',{},p),{attribute:'transform',type:'translate',value:'0 6'});
  assert.equal(channelValue('anime-visible',{mouth:0},p).value,0);
  assert.equal(channelValue('anime-teeth-visible',{mouth:1,vowel:'u'},p,{vowels:true}).value,0);
});
