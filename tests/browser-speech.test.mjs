import test from 'node:test';
import assert from 'node:assert/strict';
import {browserSpeech} from '../web/browser-speech.js';
import {cleanTtsConfig} from '../web/tts-ui.js';
class Utterance{constructor(text){this.text=text;}}
test('browser speech completes only on end, cancellation rejects',async()=>{
 let u,cancelled=0,done=false;const synth={speak(v){u=v;},cancel(){cancelled++;}},control=new AbortController();
 const p=browserSpeech('hello',{synth,Utterance,signal:control.signal}).then(()=>done=true);
 u.onstart();await Promise.resolve();assert.equal(done,false);u.onend();await p;assert.equal(done,true);
 const next=browserSpeech('bye',{synth,Utterance,signal:control.signal});control.abort();await assert.rejects(next,{name:'AbortError'});assert.equal(cancelled,1);
});
test('browser start failure and runtime error reject instead of reporting spoken',async()=>{
 const synth={speak(u){queueMicrotask(()=>u.onerror({error:'voice-unavailable'}));},cancel(){}};
 await assert.rejects(browserSpeech('test',{synth,Utterance}),/voice-unavailable/);
 await assert.rejects(browserSpeech('test',{synth:{speak(){},cancel(){}},Utterance,startTimeout:1}),/開始できません/);
});
test('TTS config restores engine settings without credentials or unknown fields',()=>{
 const c=cleanTtsConfig({engine:'aivis',speaker_id:123456789,api_key:'secret',other:'unknown'});
 assert.equal(c.base_url,'http://127.0.0.1:10101');assert.equal(c.speaker_id,123456789);assert.equal('api_key' in c,false);assert.equal('other' in c,false);
 assert.equal(cleanTtsConfig({engine:'browser',browser_voice:'voice-id'}).browser_voice,'voice-id');
 assert.equal(cleanTtsConfig({engine:'unknown'}).engine,'sbv2');
});
