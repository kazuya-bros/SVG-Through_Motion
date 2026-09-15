import test from 'node:test';
import assert from 'node:assert/strict';
import {createExpressionSelection} from '../web/expression-selection.js';

test('overlapping holds restore the remaining hold then the base regardless of release order',()=>{
 const s=createExpressionSelection(1);s.hold('a',4);s.hold('b',2);assert.equal(s.current,2);
 s.release('a');assert.equal(s.current,2);s.release('b');assert.equal(s.current,1);
 s.hold('a',4);s.hold('b',2);s.release('b');assert.equal(s.current,4);s.release('a');assert.equal(s.current,1);
});
test('repeat presses are ignored; explicit selection cancels pending holds',()=>{
 const s=createExpressionSelection();s.hold('a',4);s.hold('b',2);s.hold('a',4);assert.equal(s.current,2);
 s.select(3);s.release('a');s.release('b');assert.equal(s.current,3);
});
test('focus loss only releases local holds; disconnect releases all',()=>{
 const s=createExpressionSelection(1);s.hold('native:42',4);s.hold('local:Digit2',2);
 s.release('local:Digit2');assert.equal(s.current,4);s.releaseAll();assert.equal(s.current,1);
});
