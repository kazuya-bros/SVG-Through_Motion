import test from 'node:test';
import assert from 'node:assert/strict';
import {eyeThroughPasses,eyeThroughStrength,foregroundHairIds} from '../web/eye-through-hair.js';
import {sceneSvg,channelValue} from '../web/motion.js';
import {secondaryPoint} from '../web/secondary-motion.js';
import {rigGroups} from '../web/rig.js';
const svg='<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10v10H0Z"/></svg>';
const part=(id,role,extra={})=>({id,role,name:id,x:0,y:0,width:10,height:10,visible:true,opacity:1,svgText:svg,...extra});
const fixture=()=>({width:100,height:100,parts:[part('back','hair',{deformGroup:'back'}),part('eye','white-l'),part('lash','lash-l',{closedSvgText:svg}),part('front','static',{deformGroup:'front'}),part('ink','static',{blinkOverlay:'l'})],settings:{eyeThroughHair:true,eyeThroughHairStrength:.35}});

test('cached eye-through passes see replacement motion settings immediately, including first ON and reset',()=>{
 const p=fixture(),cloth=part('cloth','static',{name:'bottomwear',width:30,height:60,independentAccessory:true});
 p.parts.unshift(cloth);
 const passes=eyeThroughPasses(p),group=rigGroups(passes.base).find(g=>g.parts.some(q=>q.id==='cloth'));
 const pose={secondaryPhase:1.2},point=()=>secondaryPoint(10,60,group,pose);
 assert.deepEqual(point(),[10,60]);
 cloth.secondaryMotion={enabled:true,amount:20,cycles:1,range:50};const low=point();assert.notDeepEqual(low,[10,60]);
 cloth.secondaryMotion={enabled:true,amount:80,cycles:1,range:50};assert.ok(Math.abs(point()[0]-10)>Math.abs(low[0]-10)*3.9);
 const fast=point();cloth.secondaryMotion={enabled:true,amount:80,cycles:2,range:50};assert.notDeepEqual(point(),fast);
 const middle=secondaryPoint(10,45,group,pose);cloth.secondaryMotion={enabled:true,amount:80,cycles:2,range:10};assert.notDeepEqual(secondaryPoint(10,45,group,pose),middle);
 delete cloth.secondaryMotion;assert.deepEqual(point(),[10,60]);
 for(const pass of Object.values(passes))assert.equal(pass.parts[0].secondaryMotion,undefined);
});
test('only foreground hair participates and legacy ink is suppressed without changing saved parts',()=>{
 const p=fixture(),before=JSON.stringify(p),passes=eyeThroughPasses(p);
 assert.deepEqual([...foregroundHairIds(p)],['front']);
 assert.equal(passes.base.parts.at(-1).visible,false);
 assert.deepEqual(passes.hair.parts.filter(p=>p.visible).map(p=>p.id),['front']);
 assert.equal(passes.lashes.parts.find(p=>p.id==='eye').opacity,0);
 assert.equal(passes.lashes.parts.find(p=>p.id==='lash').closedSvgText,svg);
 assert.deepEqual(passes.base.parts.map(p=>p.id),p.parts.map(p=>p.id));
 assert.equal(JSON.stringify(p),before);
 p.settings={...p.settings,headPitch:.5};assert.equal(passes.hair.settings.headPitch,.5);
});
test('disabled and missing hair retain old behavior; zero strength cannot restore fixed ghost ink',()=>{
 const p=fixture();assert.equal(eyeThroughPasses(p,{eyeThroughHair:false}),null);
 assert.equal(eyeThroughPasses({...p,parts:p.parts.slice(0,3)}),null);
 p.settings.eyeThroughHairStrength=0;assert.equal(eyeThroughStrength(p.settings),0);assert.equal(eyeThroughPasses(p).base.parts.at(-1).visible,false);
 assert.equal(eyeThroughStrength({eyeThroughHair:true,eyeThroughHairStrength:5}),1);
});
test('SVG duplicates live blink channels through an alpha mask with unique ids',()=>{
 const p=fixture(),s=sceneSvg(p);assert.match(s,/mask-type:alpha/);assert.match(s,/eye-through-strength/);
 assert.equal((s.match(/data-channel="closed-l"/g)||[]).length,3);
 const ids=[...s.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
 assert.equal(channelValue('eye-through-strength',{},p).value,.35);
 assert.equal(eyeThroughPasses(eyeThroughPasses(p).base),null);
});
