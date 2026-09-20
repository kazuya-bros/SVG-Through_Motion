import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultScene,stageFrame,stagePose,captionPages,exampleRecipes,blendScene} from '../web/stage-model.js';
import {createStagePlayback} from '../web/stage-playback.js';
const state=()=>({revision:1,mode:'ai',baseline:defaultScene(),active:{request_id:'one',started_at:100,recipe:exampleRecipes()[0]}});
test('timeline transitions between steps and restores the untouched baseline',()=>{
 const s=state(),before=JSON.stringify(s.baseline);
 assert.equal(stageFrame(s,100).scene.pose.yaw,0);
 assert.equal(stageFrame(s,102).scene.pose.yaw,-.18);
 assert.equal(stageFrame(s,105).scene.effect,'happy');
 assert.equal(stageFrame(s,110).phase,'completed');
 assert.deepEqual(stageFrame(s,120).scene,s.baseline);
 assert.equal(JSON.stringify(s.baseline),before);
 assert.deepEqual(stageFrame(s,105),stageFrame(JSON.parse(JSON.stringify(s)),105));
});
test('AI pose is bounded and preserves audio-driven mouth and vowel data',()=>{
 const scene=defaultScene();scene.pose={...scene.pose,yaw:.8,blinkL:.5};scene.movement=.5;
 const result=stagePose({yaw:.8,blinkL:.8,sway:10,mouth:.73,vowelWeights:{a:.8}},scene);
 assert.equal(result.yaw,1);assert.equal(result.blinkL,1);assert.equal(result.sway,5);assert.equal(result.mouth,.73);assert.deepEqual(result.vowelWeights,{a:.8});
});
test('image layers cross-fade and captions wrap CJK / surrogate pairs without loss',()=>{
 const a=defaultScene(),b=defaultScene();b.overlays=[{asset_id:'a',opacity:.8}];
 assert.equal(blendScene(a,b,.5).overlays[0].opacity,.4);
 const text='これは長い字幕です🌙星も浮かびます。';
 const pages=captionPages(text,s=>Array.from(s).length,5,2);
 assert.equal(pages.flat().join(''),text);assert.ok(pages.every(p=>p.length<=2));assert.ok(pages.flat().every(s=>Array.from(s).length<=5));
});
test('no running acknowledgement until assets load and a real frame renders',async()=>{
 let loaded;const events=[],player=createStagePlayback({renderer:{load:()=>new Promise(r=>loaded=r)},send:e=>events.push(e)});
 const s=state();s.active.started_at=null;s.active.recipe.steps[0].scene.overlays=[{asset_id:'a'}];
 player.receive(s);assert.equal(player.frame(100).phase,'idle');assert.equal(events.length,0);
 loaded();await new Promise(r=>setImmediate(r));const frame=player.frame(Date.now()/1000);assert.equal(frame.phase,'running');assert.equal(events.length,0);
 player.rendered(frame);player.rendered(frame);assert.equal(events.length,1);assert.equal(events[0].status,'running');
});
test('late image loads never restore a replaced or reset performance',async()=>{
 let loaded;const player=createStagePlayback({renderer:{load:()=>new Promise(r=>loaded=r)},send:()=>{}});
 const s=state();s.active.started_at=null;s.active.recipe.steps[0].scene.overlays=[{asset_id:'a'}];player.receive(s);player.reset();loaded();await new Promise(r=>setImmediate(r));assert.equal(player.state.active,null);assert.equal(player.frame(105).phase,'idle');
});
test('pending colour textures defer the visible performance clock until drawing is ready',async()=>{
 const player=createStagePlayback({renderer:{load:()=>Promise.resolve()},send:()=>{}}),s=state();s.active.started_at=null;player.receive(s);await new Promise(r=>setImmediate(r));
 player.deferStart(200);assert.equal(player.frame(200).elapsed,0);player.deferStart(205);assert.equal(player.frame(205).phase,'running');assert.equal(player.frame(205).elapsed,0);
});
test('speech-bound stage restores baseline; unbound stage continues',()=>{
 const events=[],player=createStagePlayback({renderer:{load:()=>Promise.resolve()},send:e=>events.push(e)});
 const s=state();player.receive(s);player.speechEnded();assert.ok(player.state.active);
 s.active.recipe.until_speech_end=true;player.receive(s);player.speechEnded();assert.equal(player.state.active,null);assert.equal(events[0].status,'interrupted');
});
