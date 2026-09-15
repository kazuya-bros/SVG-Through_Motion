import test from 'node:test';
import assert from 'node:assert/strict';
import {microphoneEnvelope} from '../web/microphone.js';

test('microphone gate rejects background noise, opens on speech and releases smoothly',()=>{
  assert.equal(microphoneEnvelope(new Float32Array(128).fill(.005)),0);
  const loud=new Float32Array(128).fill(.12),silence=new Float32Array(128);
  let level=microphoneEnvelope(loud);assert.ok(level>.6&&level<1);
  const next=microphoneEnvelope(silence,10,.01,level);assert.ok(next>0&&next<level);
  for(let i=0;i<40;i++)level=microphoneEnvelope(silence,10,.01,level);
  assert.ok(level<.0001);
});
