import test from 'node:test';
import assert from 'node:assert/strict';
import {rememberCharacter} from '../web/main-menu.js';

test('saved character history accepts both old and new project filenames',()=>{
 const previous=globalThis.localStorage,values=new Map();
 globalThis.localStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
 try{
  const old={url:`/api/exports/${'a'.repeat(32)}/khaula-motion.project.json`};
  const current={url:`/api/exports/${'b'.repeat(32)}/svg-through-motion.project.json`};
  rememberCharacter(old,'以前の保存');rememberCharacter(current,'新しい保存');
  const items=JSON.parse(values.get('svg-through.saved-characters.v1'));
  assert.deepEqual(items.map(p=>p.url),[current.url,old.url]);
 }finally{if(previous===undefined)delete globalThis.localStorage;else globalThis.localStorage=previous;}
});
