import test from 'node:test';
import assert from 'node:assert/strict';
import {effectCue,effectFrame,effectNoise,dissolveThreshold,createEffectPlayback} from '../web/character-effects.js';

const command=(preset,extra={})=>({preset,duration:4,strength:.7,request_id:preset,...extra});
test('direction survives OBS serialization and bounce ends at the original pose',()=>{
 const cue=effectCue(command('bounce',{direction:'left'}),0);
 assert.equal(effectFrame(JSON.parse(JSON.stringify(cue)),1).direction,'left');
 assert.equal(effectFrame(cue,4).preset,'none');
 assert.throws(()=>effectCue(command('bounce',{direction:'diagonal'}),0));
});
test('disappearance persists; appearance and reset restore the character',()=>{
 const out=effectCue(command('dissolve'),10),enter=effectCue(command('appear'),10);
 assert.equal(effectFrame(out,10).visibility,1);assert.equal(effectFrame(out,14).visibility,0);assert.equal(effectFrame(out,30).preset,'dissolve');
 assert.equal(effectFrame(enter,10).visibility,0);assert.equal(effectFrame(enter,14).visibility,1);
 assert.equal(effectFrame(effectCue(command('none'),10),10).preset,'none');
 for(const preset of ['comms','happy'])assert.equal(effectFrame(effectCue(command(preset),10),14).preset,'none');
});
test('OBS and player evaluate the same bounded time and particle distribution',()=>{
 const cue=effectCue(command('dissolve'),7);
 assert.deepEqual(effectFrame(cue,9),effectFrame(JSON.parse(JSON.stringify(cue)),9));
 assert.equal(effectFrame(cue,6).progress,0);
 for(let i=0;i<100;i++){assert.equal(effectNoise(i),effectNoise(i));assert.ok(effectNoise(i)>=0&&effectNoise(i)<1);}
 assert.ok(dissolveThreshold(0,5,192)<dissolveThreshold(191,5,192));
 assert.equal(effectFrame({...cue,duration:0},9).preset,'none');
 assert.throws(()=>effectCue(command('invalid'),0));assert.throws(()=>effectCue(command('happy',{strength:NaN}),0));
});
test('receipts follow rendered lifecycle, replacement interrupts, repeats never restart',()=>{
 const events=[],player=createEffectPlayback(e=>events.push(e));
 player.start(command('happy'),0);assert.equal(events.length,0);
 player.rendered(.1);player.rendered(.2);assert.deepEqual(events,[{request_id:'happy',status:'running'}]);
 player.start(command('happy'),2);assert.equal(player.cue.started_at,0);
 player.start(command('comms'),2);assert.equal(events.at(-1).status,'interrupted');
 player.rendered(2.1);player.rendered(6);player.rendered(7);assert.equal(events.filter(e=>e.status==='completed').length,1);
 player.reset();assert.equal(player.cue,null);
});
test('speech-bound effects reset at speech end or duration; unbound effects continue',()=>{
 const events=[],player=createEffectPlayback(e=>events.push(e));
 player.start(command('happy'),0);player.speechEnded();assert.ok(player.cue);
 player.start(command('dissolve',{until_speech_end:true}),0,true);assert.equal(player.cue.reduced,true);
 assert.equal(effectFrame(player.cue,4).preset,'none');
 assert.equal(effectFrame(player.cue,4).visibility,1);
 player.speechEnded();assert.equal(player.cue,null);assert.equal(events.at(-1).status,'interrupted');
});
