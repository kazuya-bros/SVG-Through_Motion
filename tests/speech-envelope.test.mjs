import test from 'node:test';
import assert from 'node:assert/strict';
import {SpeechEnvelope} from '../web/speech-envelope.js';
test('speech holds through short gaps and settles to closed in sustained silence',()=>{
 const e=new SpeechEnvelope();for(let t=0;t<=200;t+=10)e.step(.5,t);
 for(let t=210;t<=280;t+=10)assert.ok(e.step(0,t)>.2);
 for(let t=290;t<=1000;t+=10)e.step(0,t);
 assert.equal(e.level,0);
});
test('background noise never opens a resting mouth; stop resets without residue',()=>{
 const e=new SpeechEnvelope();for(let t=0;t<300;t+=10)assert.equal(e.step(.02,t),0);
 e.step(.8,300);assert.ok(e.level>0);e.reset();assert.equal(e.step(0,310),0);
});
test('attack and release are time based across frame rates',()=>{
 const run=fps=>{const e=new SpeechEnvelope();e.step(0,0);for(let n=1;n<=fps/2;n++)e.step(.6,n*1000/fps);return e.level;};
 assert.ok(Math.abs(run(30)-run(120))<.00001);
});
test('sample gate and gain are shared by microphone and recorded audio',()=>{
 const e=new SpeechEnvelope();assert.equal(e.sample(new Float32Array(50).fill(.008),10,0,.01),0);
 assert.ok(e.sample(new Float32Array(50).fill(.15),10,50,.01)>.4);
});
