import test from 'node:test';
import assert from 'node:assert/strict';
import {createModeSwitch,broadcastView} from '../web/broadcast-mode.js';

test('switching inputs disables speech reception before stopping the old input',async()=>{
 const events=[];
 const control=createModeSwitch({initial:'api',reception:async enabled=>events.push(['reception',enabled]),stopInputs:()=>events.push('stop'),changed:mode=>events.push(mode)});
 assert.equal(await control.select('camera'),true);
 assert.deepEqual(events,[['reception',false],'stop','camera']);
 assert.equal(control.mode,'camera');
 events.length=0;await control.select('api');
 assert.deepEqual(events,[['reception',true],'stop','api']);
});
test('failed or invalid mode changes preserve the previous input',async()=>{
 let stopped=false;
 const control=createModeSwitch({initial:'mic',reception:async()=>{throw Error('offline');},stopInputs:()=>{stopped=true;},changed:()=>{throw Error('unexpected');}});
 await assert.rejects(control.select('api'),/offline/);
 assert.equal(control.mode,'mic');assert.equal(control.busy,false);assert.equal(stopped,false);
 await assert.rejects(control.select('unknown'));assert.equal(await control.select('mic'),false);
});
test('only one mode change is applied while a request is pending',async()=>{
 let release;let changes=0;
 const control=createModeSwitch({reception:()=>new Promise(resolve=>{release=resolve;}),stopInputs(){},changed(){changes++;}});
 const first=control.select('camera');assert.equal(control.busy,true);
 assert.equal(await control.select('api'),false);release();await first;
 assert.equal(control.mode,'camera');assert.equal(changes,1);
});
test('broadcast framing preserves preview placement and rejects malformed values',()=>{
 assert.deepEqual(broadcastView(new URLSearchParams()),{x:0,y:0,scale:1});
 assert.deepEqual(broadcastView(new URLSearchParams('viewX=.2&viewY=-.1&viewScale=1.5')),{x:.2,y:-.1,scale:1.5});
 assert.deepEqual(broadcastView(new URLSearchParams('viewX=Infinity&viewY=NaN&viewScale=bad')),{x:0,y:0,scale:1});
 assert.deepEqual(broadcastView(new URLSearchParams('viewX=99&viewY=-99&viewScale=0')),{x:4,y:-4,scale:.25});
});
