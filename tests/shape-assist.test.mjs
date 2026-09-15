import test from 'node:test';
import assert from 'node:assert/strict';
import {shapeAssistTargets} from '../web/shape-assist.js';
test('shape entry targets only visible closed shapes of the requested feature',()=>{
  const p={parts:[{id:'r',role:'lash-r',closedSvgText:'eye'},{id:'l',role:'lash-l',closedSvgText:'eye'},{id:'m',role:'mouth',closedSvgText:'mouth'},{id:'hidden',role:'lash-r',closedSvgText:'eye',visible:false},{id:'open',role:'lash-l'},{id:'hat',role:'static',closedSvgText:'ignore'}]};
  assert.deepEqual(shapeAssistTargets(p,'eyes'),['r','l']);assert.deepEqual(shapeAssistTargets(p,'mouth'),['m']);
  assert.deepEqual(shapeAssistTargets(null,'eyes'),[]);assert.throws(()=>shapeAssistTargets(p,'hair'));
});
