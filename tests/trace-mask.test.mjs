import test from 'node:test';
import assert from 'node:assert/strict';
import {isCanvasRing,repairTraceMasks,traceContour} from '../web/trace-mask.js';

test('translated crop-edge contours are snapped without accepting unsupported or incomplete paths',()=>{
 assert.equal(traceContour('M-25.44 0 L74.56 0 L74.56 20 L-25.44 20 Z','translate(25.44140625,0)',100,100),'M 0 0 L 100 0 L 100 20 L 0 20 Z');
 assert.equal(traceContour('M1 2 C3 4 5 6 7 8 Z','translate(10,20)',100,100),'M 11 22 C 13 24 15 26 17 28 Z');
 for(const path of ['M0 0L1 Z','M0 0L1 1','M0 0Q1 1 2 2Z','M0 0M1 1Z'])assert.equal(traceContour(path,'',100,100),null);
 assert.equal(traceContour('M0 0L10 0L0 10Z','rotate(2)',100,100),null);
});

test('only an exact canvas rectangle is recognized as a mask backdrop',()=>{
 assert.equal(isCanvasRing('M0 0 C33 0 66 0 100 0 C100 33 100 66 100 100 C66 100 33 100 0 100 C0 66 0 33 0 0 Z',100,100),true);
 assert.equal(isCanvasRing('M0 0 L100 0 L100 100 L0 100 Z',100,100),true);
 for(const path of ['M0 0 C33 1 66 0 100 0 L100 100 L0 100 Z','M0 0 L100 100 L100 0 L0 100 Z','M1 0 L100 0 L100 100 L1 100 Z','M0 0 L100 0 L100 100 L0 100 Z M5 5 L8 8Z','M0 0 Q50 0 100 0 Z','M0 0 L100 0 L100 100 L0 100'])assert.equal(isCanvasRing(path,100,100),false,path);
});

test('ordinary vector art and absent sources are left untouched',()=>{
 const text='<svg><path d="M0 0L10 10"/></svg>';assert.equal(repairTraceMasks(text),text);assert.equal(repairTraceMasks(undefined),undefined);
});
