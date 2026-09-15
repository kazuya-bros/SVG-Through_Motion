import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizedSpring} from '../web/pachipaku-motion.js';
import {vowelScale,cycleVowels,kanaTrack,timedVowel} from '../web/vowels.js';
import {channelValue,mouthScale,loopPose} from '../web/motion.js';
test('normalized double spring reaches requested amplitude at every speed and softness',()=>{
 for(const duration of [1,4,30])for(const cycles of [1,2,4])for(const softness of [0,.5,1])for(const u of [0,.4,1]){
  let peak=0;for(let i=0;i<720;i++){const phase=i/720*Math.PI*2,value=normalizedSpring(phase,u,duration,cycles,softness);peak=Math.max(peak,Math.abs(value));assert.ok(Math.abs(value)<=1.000001);assert.ok(Math.abs(value-normalizedSpring(phase+Math.PI*2,u,duration,cycles,softness))<1e-10);}
  assert.ok(peak>.999,'amplitude should not disappear for a slow loop');
 }
 assert.notEqual(normalizedSpring(1,.8,4,1,0),normalizedSpring(1,.8,4,1,1));
});
test('vowel shapes differ, U smaller than O, I flatter than E; neutral and disabled keep original',()=>{
 const s={vowels:true},shapes=['a','i','u','e','o'].map(vowel=>vowelScale({vowel},s));
 assert.equal(new Set(shapes.map(v=>v.join(','))).size,5);assert.ok(shapes[1][0]>shapes[0][0]&&shapes[1][1]<shapes[3][1]);assert.ok(shapes[2][0]<shapes[4][0]&&shapes[2][1]<shapes[4][1]);
 assert.deepEqual(vowelScale({},s),[1,1]);assert.deepEqual(vowelScale({vowel:'i'},{}),[1,1]);
 assert.deepEqual(mouthScale(0,{vowels:true,closedWidth:.8},{vowel:'i'}),[.8,.045]);
 const p={width:1024,height:1024,parts:[],settings:s};
 assert.equal(channelValue('mouth-open',{mouth:.5,vowel:'i'},p).value,'1.18 0.15');
 assert.deepEqual(cycleVowels(0),cycleVowels(1));assert.deepEqual(loopPose(0,{duration:4,vowels:true}),loopPose(4,{duration:4,vowels:true}));
});
test('kana track supports digraphs, katakana, prolonged vowels and closure; refuses kanji guesses',()=>{
 assert.deepEqual(kanaTrack('あいうえお').map(t=>t.vowel),['a','i','u','e','o']);
 assert.deepEqual(kanaTrack('キャット、コーヒー').map(t=>t.vowel),['a',null,'o',null,'o','o','i','i']);
 assert.deepEqual(kanaTrack('こんにちは').map(t=>t.vowel),['o',null,'i','i','a']);
 assert.deepEqual(kanaTrack('今日は'),[]);assert.deepEqual(kanaTrack('model 123'),[]);
 const track=kanaTrack('あいうえお');assert.equal(timedVowel(track,2.5,5),'u');assert.equal(timedVowel(track,5,5),null);assert.equal(timedVowel(track,0,NaN),null);
});
