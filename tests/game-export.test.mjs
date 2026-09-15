import test from 'node:test';
import assert from 'node:assert/strict';
import {splitPortraitPixels,exportGameCharacter} from '../web/game-export.js';
import {gameSupportFiles} from '../web/game-export-support.js';

test('portrait split preserves alpha and independently reconstructs eye/mouth combinations',()=>{
  const base=new Uint8ClampedArray([10,20,30,128,40,50,60,255,70,80,90,200]);
  const eye=base.slice(),mouth=base.slice();eye.set([100,110,120,100],0);mouth.set([0,0,0,0],8);
  const result=splitPortraitPixels(base,[eye],[mouth]);
  for(let e=0;e<2;e++)for(let m=0;m<2;m++){
    const assembled=result.base.slice();
    for(const layer of [result.eyes[e],result.mouths[m]])for(let i=0;i<assembled.length;i+=4)if(layer[i+3])assembled.set(layer.subarray(i,i+4),i);
    const expected=base.slice();if(e)expected.set(eye.subarray(0,4),0);if(m)expected.set(mouth.subarray(8,12),8);
    assert.deepEqual(assembled,expected);
  }
});
test('intersecting correction regions fail instead of exporting broken layers',()=>{
  const base=new Uint8ClampedArray([0,0,0,255]),variant=new Uint8ClampedArray([1,0,0,255]);
  assert.throws(()=>splitPortraitPixels(base,[variant],[variant]),/重なって/);
  assert.throws(()=>splitPortraitPixels(base,[new Uint8Array(8)],[]),/サイズ/);
});
test('target validation happens before rendering',async()=>{
  await assert.rejects(exportGameCharacter({}, {target:'unknown'}),/出力先/);
});
test('engine instructions refer to matching generated asset paths and explicit dependencies',async()=>{
  const tyrano=await gameSupportFiles('tyrano','svg_test');
  assert.match(tyrano.find(([n])=>n.endsWith('_register.ks'))[1],/storage="svg_test\/mouth_close.png"/);
  assert.match(tyrano.find(([n])=>n.endsWith('_example.ks'))[1],/#svg_test/);
  const mz=await gameSupportFiles('rpgmaker','svg_test');
  assert.match(mz.find(([n])=>n==='README.txt')[1],/プラグイン本体はこのZIPに含みません/);
  assert.match(mz.find(([n])=>n.endsWith('.js'))[1],/direction:'horizon'/);
});
