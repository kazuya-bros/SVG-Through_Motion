import test from 'node:test';
import assert from 'node:assert/strict';
import {createEffectPlayback,effectFrame} from '../web/character-effects.js';
import {recipeLook,recipePose} from '../web/avatar-recipe.js';
import {defaultLook} from '../web/broadcast-look.js';
const command=(id,preview=false)=>({request_id:id,preset:'bundle',duration:2,strength:1,preview,recipe:{behavior:preview?'timed':'select',visibility:true,appearance:{...defaultLook(),blush_rotation:20},components:[{kind:'expression',expression_index:1,strength:1},{kind:'outline'},{kind:'blush'},{kind:'sweat'}]}});
test('bundle combines appearance and expression; selected appearance persists',()=>{
 const p=createEffectPlayback();p.start(command('selected'),0);
 const frame=effectFrame(p.cue,10),look=recipeLook(defaultLook(),frame);
 assert.equal(frame.preset,'bundle');assert.equal(look.outline,true);
 assert.deepEqual(look.emotion_layers,['blush','sweat']);assert.equal(look.blush_rotation,20);
 assert.equal(recipePose({blinkL:0},{},frame).blinkL,.35);
});
test('preview pauses and restores previous cue; stale stop cannot erase a newer selection',()=>{
 const events=[],p=createEffectPlayback(e=>events.push(e));p.start(command('selected'),0);p.rendered(1);
 p.start(command('preview',true),1);p.rendered(3);
 assert.equal(p.cue.request_id,'selected');assert.equal(p.cue.started_at,2);
 p.start(command('preview2',true),4);p.start(command('new'),5);
 p.start({request_id:'stale-stop',preset:'none',duration:1,strength:1,restore_preview_id:'preview2'},6);
 assert.equal(p.cue.request_id,'new');assert(events.some(e=>e.request_id==='preview'&&e.status==='completed'));
});
test('selected preview remains past its duration, including disappearance, until explicitly stopped',()=>{
 const p=createEffectPlayback(),c=command('persistent',true);c.recipe.behavior='select';c.recipe.visibility=false;p.start(c,0);p.rendered(100);
 assert.equal(p.cue.request_id,'persistent');assert.equal(effectFrame(p.cue,100).recipe.visibility,false);
 p.start({request_id:'stop',preset:'none',duration:1,strength:1,restore_preview_id:'persistent'},101);assert.equal(p.cue,null);
});
