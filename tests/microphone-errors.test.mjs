import test from 'node:test';
import assert from 'node:assert/strict';
import {microphoneError} from '../web/microphone-capture.js';
test('unsupported browser errors explain how to continue',()=>{
 for(const e of [new DOMException('Not supported','NotSupportedError'),new Error('Not supported')]){
  assert.match(microphoneError(e),/Chrome／Edge/);assert.doesNotMatch(microphoneError(e),/Not supported/);
 }
});
