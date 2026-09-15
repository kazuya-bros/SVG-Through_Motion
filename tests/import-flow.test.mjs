import test from 'node:test';
import assert from 'node:assert/strict';
import {selectDonorFiles} from '../web/import-flow.js';
import {usesClosedDonor,editGuidance} from '../web/edit-guidance.js';
const eyes={name:'closed-eyes.psd'},mouth={name:'closed-mouth.psd'},vowel={name:'i.psd'};
const files={eyes_closed:eyes,mouth_closed:mouth};
test('basic choice ignores previously selected donor files',()=>{
 assert.deepEqual(selectDonorFiles({mode:'basic',eyes:'psd',mouth:'psd'},files),{});
});
test('mixed sources send chosen endpoints and ignore legacy vowel inputs',()=>{
 assert.deepEqual(selectDonorFiles({mode:'donors',eyes:'auto',mouth:'psd'},files),{mouth_closed:mouth});
 assert.deepEqual(selectDonorFiles({mode:'donors',eyes:'psd',mouth:'auto'},files),{eyes_closed:eyes});
});
test('shared PSD supplies both endpoints without stale separate mouth',()=>{
 const result=selectDonorFiles({mode:'donors',eyes:'psd',mouth:'same'},files);
 assert.equal(result.eyes_closed,eyes);assert.equal(result.mouth_closed,eyes);
});
test('selected PSD sources require files; generated endpoints do not',()=>{
 assert.throws(()=>selectDonorFiles({mode:'donors',eyes:'psd',mouth:'auto'},{}),/閉じ目/);
 assert.throws(()=>selectDonorFiles({mode:'donors',eyes:'auto',mouth:'psd'},{}),/閉じ口/);
 assert.throws(()=>selectDonorFiles({mode:'donors',eyes:'auto',mouth:'same'},files),/閉じ目/);
 assert.deepEqual(selectDonorFiles({mode:'donors',eyes:'auto',mouth:'auto'},{}),{});
});
const part=role=>({role,closedSource:'psd',closedSvgText:'<svg/>'});
test('both generated and supplied endpoints start with motion review; correction is explicit',()=>{
 const p={parts:[part('lash-l'),part('lash-r')]};
 assert.equal(usesClosedDonor(p,'eyes'),true);assert.equal(usesClosedDonor(p,'mouth'),false);
 assert.equal(editGuidance(p,'eyes')[1],'瞬きを確認');
 assert.equal(editGuidance(p,'mouth')[1],'口の開閉を確認');
 assert.equal(editGuidance(p,'eyes',true)[1],'閉じ目を補正する');
 assert.equal(usesClosedDonor({parts:[part('lash-l')]},'eyes'),false);
 assert.equal(usesClosedDonor({parts:[{role:'mouth',closedSvgText:'<svg/>'}]},'mouth'),false);
 assert.equal(editGuidance({parts:[part('mouth')]},'mouth')[1],'口の開閉を確認');
 assert.equal(editGuidance(null,'eyes')[1],'瞬きを確認');
});
