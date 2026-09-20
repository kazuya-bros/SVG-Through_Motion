import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultLook,replaceColor,colorable,rgb,hsl} from '../web/broadcast-look.js';
import {defaultScene,recipeAssets,stageFrame} from '../web/stage-model.js';
import {effectCue,effectFrame} from '../web/character-effects.js';
test('recolour preserves linework, whites, unrelated hues and changes the requested colour family',()=>{
 const rule={from_color:'#e98b40',to_color:'#558acc',tolerance:.08};
 for(const color of ['#111111','#ffffff','#6688cc'])assert.equal(replaceColor(color,rule),color);
 assert.notEqual(replaceColor('#e98b40',rule),'#e98b40');
 assert.notEqual(replaceColor('#ad6025',rule),'#ad6025');
 assert.equal(colorable({role:'iris-l',svgText:'<svg/>'}),false);assert.equal(colorable({role:'static',svgText:'<svg/>'}),true);
});
test('picked colour reaches its exact target and neighbouring shades retain their lightness differences',()=>{
 const rule={from_color:'#cc8844',to_color:'#4488cc',tolerance:.1};
 assert.equal(replaceColor(rule.from_color,rule),rule.to_color);
 const shadow='#995522',changed=replaceColor(shadow,rule);
 const before=hsl(rgb(shadow))[2]-hsl(rgb(rule.from_color))[2],after=hsl(rgb(changed))[2]-hsl(rgb(rule.to_color))[2];
 assert.ok(Math.abs(before-after)<.005);
 assert.equal(replaceColor('#111111',{...rule,from_color:'#111111',to_color:'#334455'}),'#334455');
});
test('appearance assets preload with recipes and return to the baseline after the performance',()=>{
 const scene=defaultScene();scene.appearance={...defaultLook(),emotion:'image',emotion_asset_id:'e',light_asset_id:'b'};
 const recipe={duration:3,transition:.3,steps:[{at:0,scene}]};assert.deepEqual(recipeAssets(recipe),['b','e']);
 const baseline=defaultScene();baseline.appearance.outline=true;
 assert.deepEqual(stageFrame({baseline,active:{started_at:0,recipe}},4).scene,baseline);
});
test('line entrance is available to the same cue protocol and restores the full drawing',()=>{
 const cue=effectCue({preset:'ink',duration:4,strength:1,request_id:'line'},10);
 assert.equal(effectFrame(cue,11).preset,'ink');assert.equal(effectFrame(cue,14).preset,'none');
});
