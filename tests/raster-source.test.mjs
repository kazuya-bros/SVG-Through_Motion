import test from 'node:test';
import assert from 'node:assert/strict';
import {svgSignature,rasterProject,matchingRasterSource} from '../web/raster-source.js';
test('per-part SVG and PNG choices override defaults but never hide vector edits',async()=>{
 const text='<svg><path fill="red"/></svg>',part={role:'static',width:2,height:2,svgText:text,rasterSourceUrl:'data:image/png;base64,YQ==',rasterSignature:await svgSignature(text)};
 const p={parts:[{...part,renderSource:'original'}],settings:{renderSource:'svg'}};
 assert.match((await rasterProject(p)).parts[0].svgText,/<image /);
 p.parts[0].svgText=text.replace('red','blue');assert.equal((await rasterProject(p)).parts[0].svgText,p.parts[0].svgText);
 p.parts=[{...part,renderSource:'svg'}];p.settings.renderSource='original';assert.equal((await rasterProject(p)).parts[0].svgText,text);
});
test('saved SVG ID prefixes preserve provenance, edited colors invalidate it',async()=>{
  const a='<svg><defs><mask id="a"><path fill="white"/></mask></defs><path mask="url(#a)" fill="red"/></svg>';
  const b=a.replaceAll('id="a"','id="s0-a"').replaceAll('url(#a)','url(#s0-a)');
  assert.equal(await svgSignature(a),await svgSignature(b));
  assert.notEqual(await svgSignature(a),await svgSignature(a.replace('red','blue')));
  const p={role:'static',width:32,height:32,svgText:b,rasterSourceUrl:'data:image/png;base64,YQ==',rasterSignature:await svgSignature(a)};
  const project={parts:[p],settings:{renderSource:'original'}};
  assert.match((await rasterProject(project)).parts[0].svgText,/<image /);
  const edited={...p,svgText:b.replace('red','blue')};
  assert.equal((await rasterProject({...project,parts:[edited]})).parts[0],edited);
  assert.equal(await rasterProject({...project,settings:{renderSource:'svg'}}).then(p=>p.parts[0]),p);
});

test('PSD source survives XML serialization without replacing actual vector edits',async()=>{
 const raw='<svg><path id="a" d="M0 0L4 4" fill="red" /></svg>';
 const loaded=raw.replace('id="a"','id="s0-a"').replace(' />','/>');
 const source={svgText:raw,originalUrl:'data:image/png;base64,YQ=='};
 const p={role:'static',width:32,height:32,svgText:loaded,rasterSourceUrl:source.originalUrl,rasterSignature:await svgSignature(raw),artworkSource:'psd',artworkSources:{psd:source}};
 assert.notEqual(await svgSignature(loaded),p.rasterSignature);
 assert.equal(await matchingRasterSource(p),source.originalUrl);
 const project={parts:[p],settings:{renderSource:'original'}};
 assert.match((await rasterProject(project)).parts[0].svgText,/<image /);
 for(const changed of [loaded.replace('red','blue'),loaded.replace('L4 4','L8 4')])assert.equal(await matchingRasterSource({...p,svgText:changed}),null);
 assert.equal(await matchingRasterSource({...p,rasterDisabled:true}),null);
 assert.equal(await matchingRasterSource({...p,artworkSources:{psd:{...source,rasterDisabled:true}}}),null);
 assert.equal((await rasterProject({...project,settings:{renderSource:'svg'}})).parts[0],p);
});
