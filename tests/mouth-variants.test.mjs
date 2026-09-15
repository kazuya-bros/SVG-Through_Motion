import test from 'node:test';
import assert from 'node:assert/strict';
import {mouthVariantWeights} from '../web/mouth-variants.js';
import {sceneSvg,channelValue} from '../web/motion.js';
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><path d="M0 0 L10 10"/></svg>';
const part={id:'p000',role:'mouth',mouthMode:'source-open',visible:true,opacity:1,x:0,y:0,width:10,height:10,svgText:svg,mouthVariants:{a:svg,i:svg}};
test('donor vowels fall back to base when absent, neutral or disabled',()=>{
 assert.deepEqual(mouthVariantWeights(part,{vowel:'u'},{vowels:true}),{base:1,a:0,i:0});
 assert.equal(mouthVariantWeights(part,{vowel:'i'},{vowels:true}).i,1);
 assert.equal(mouthVariantWeights(part,{vowel:'i'},{vowels:false}).base,1);
 assert.equal(mouthVariantWeights(part,{}, {vowels:true}).base,1);
});
test('donor vowel crossfades conserve weight and SVG channels select the same artwork',()=>{
 const pose={vowelWeights:[.2,.6,.2,0,0]},settings={vowels:true},project={width:100,height:100,parts:[part],settings};
 assert.deepEqual(mouthVariantWeights(part,pose,settings),{base:.2,a:.2,i:.6});
 for(const key of ['base','a','i'])assert.equal(+channelValue('mouth-variant-p000-'+key,pose,project,settings).value,mouthVariantWeights(part,pose,settings)[key]);
 assert.match(sceneSvg(project),/mouth-variant-p000-i/);
});
