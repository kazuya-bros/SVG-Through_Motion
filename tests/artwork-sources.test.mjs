import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeArtworkSources,selectArtworkSource} from '../web/artwork-sources.js';
import {svgSignature,matchingRasterSource} from '../web/raster-source.js';
const asset=(color,x=10,width=20)=>({x,y:30,width,height:40,paths:1,svgText:`<svg><path fill="${color}" d="M0 0L10 10Z"/></svg>`,originalUrl:'data:image/png;base64,YQ=='});
test('each retained source is sanitized and untrusted geometry/URLs are rejected',()=>{
 const calls=[],sanitize=(text,prefix)=>{calls.push(prefix);return text;};
 const p={id:'p2',artworkSource:'psd',artworkSources:{psd:asset('red'),original:asset('blue')}};
 const clean=normalizeArtworkSources(p,sanitize);assert.equal(calls.length,2);assert.ok(clean.artworkSources.original);
 p.artworkSources.original.originalUrl='https://untrusted.example/x.png';assert.equal(normalizeArtworkSources(p,sanitize).artworkSources.original,undefined);
 p.artworkSources.psd.width=0;assert.deepEqual(normalizeArtworkSources(p,sanitize),{});
});
test('switch and save/reload preserve source choice, layout, pivots and both alternatives',async()=>{
 let p={...asset('red'),id:'arm',name:'右腕・袖',visible:true,pivotX:40,pivotY:35,artworkSource:'psd',artworkSources:{psd:asset('red'),original:asset('blue',15,10)}};
 p.x+=7;p.width*=2;
 await selectArtworkSource(p,'original');assert.equal(p.x,22);assert.equal(p.width,20);assert.equal(p.pivotX,40);
 assert.equal(p.rasterSignature,await svgSignature(p.svgText));
 p=JSON.parse(JSON.stringify(p));await selectArtworkSource(p,'psd');assert.equal(p.x,17);assert.equal(p.width,40);assert.match(p.svgText,/red/);assert.equal(p.artworkSource,'psd');
 assert.equal(await selectArtworkSource(p,'missing'),false);
});
test('vector edits are retained in their own choice and do not reuse stale raster colors',async()=>{
 const p={...asset('red'),artworkSource:'psd',artworkSources:{psd:asset('red'),original:asset('blue')}};
 p.rasterSignature=await svgSignature(p.svgText);p.svgText=asset('green').svgText;
 await selectArtworkSource(p,'original');await selectArtworkSource(p,'psd');
 assert.match(p.svgText,/green/);assert.equal(p.rasterDisabled,true);
});
test('formatting-only changes keep PSD pixels through switching and saved reload',async()=>{
 const source=asset('red');source.svgText=source.svgText.replace('/>',' />');
 let p={...source,svgText:asset('red').svgText,rasterSourceUrl:source.originalUrl,rasterSignature:await svgSignature(source.svgText),artworkSource:'psd',artworkSources:{psd:structuredClone(source),original:asset('blue')}};
 await selectArtworkSource(p,'original');
 p=JSON.parse(JSON.stringify(p));await selectArtworkSource(p,'psd');
 assert.equal(p.rasterDisabled,false);
 assert.equal(await matchingRasterSource(p),source.originalUrl);
});
