import test from 'node:test';
import assert from 'node:assert/strict';
import {MicrophoneMouth} from '../web/microphone-mouth.js';
const samples=value=>new Float32Array(128).fill(value);
test('quiet speech above the threshold opens as fully as loud speech',()=>{
 for(const volume of [.0105,.2]){
  const mouth=new MicrophoneMouth();
  for(let time=0;time<=150;time+=50)mouth.sample(samples(volume),.01,time);
  assert.equal(mouth.level,1);
 }
});
test('silence and below-threshold noise stay closed, including a zero threshold',()=>{
 const mouth=new MicrophoneMouth();
 for(let time=0;time<=500;time+=50)assert.equal(mouth.sample(samples(.009),.01,time),0);
 assert.equal(mouth.sample(samples(0),0,550),0);
});
test('continuous quiet speech repeatedly opens and closes fully',()=>{
 const mouth=new MicrophoneMouth(),levels=[];
 for(let time=0;time<=3000;time+=50)levels.push(mouth.sample(samples(.0105),.01,time));
 let openings=0,closures=0;
 for(let i=1;i<levels.length;i++){
  if(levels[i]>.95&&levels[i-1]<=.95)openings++;
  if(levels[i]<.05&&levels[i-1]>=.05)closures++;
 }
 assert.ok(openings>=6);assert.ok(closures>=6);
});
test('short pauses preserve the rhythm; sustained silence closes and a new phrase starts open',()=>{
 const mouth=new MicrophoneMouth(),continuous=new MicrophoneMouth();
 for(let time=0;time<=300;time+=50){
  const input=time===200?0:time===250?.008:.011;
  assert.equal(mouth.sample(samples(input),.01,time),continuous.sample(samples(.011),.01,time));
 }
 for(let time=350;time<=700;time+=50)mouth.sample(samples(0),.01,time);
 assert.equal(mouth.level,0);
 for(let time=750;time<=900;time+=50)mouth.sample(samples(.011),.01,time);
 assert.equal(mouth.level,1);
});
test('raising the threshold suppresses background noise on the next samples',()=>{
 const mouth=new MicrophoneMouth();
 for(let time=0;time<=150;time+=50)mouth.sample(samples(.015),.01,time);
 assert.equal(mouth.level,1);
 for(let time=200;time<=650;time+=50)mouth.sample(samples(.015),.05,time);
 assert.equal(mouth.level,0);
});
test('delayed capture callbacks keep a continuous voice cycling',()=>{
 const mouth=new MicrophoneMouth(),levels=[];
 for(let time=0;time<=4000;time+=200)levels.push(mouth.sample(samples(.011),.01,time));
 assert.ok(levels.some(level=>level>.95));
 assert.ok(levels.some(level=>level<.05));
});
