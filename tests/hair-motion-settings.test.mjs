import test from 'node:test';
import assert from 'node:assert/strict';
import {hairParts,setHairRegion,syncHairShape} from '../web/hair-motion-settings.js';
const fixture=()=>({width:1024,height:1024,parts:[{id:'f1',visible:true,deformGroup:'front'},{id:'f2',visible:true,deformGroup:'front'},{id:'b',visible:true,deformGroup:'back',hairControl:{rootY:80}},{id:'body',visible:true,deformGroup:'core'}]});
test('front hair controls apply across its parts without changing back hair or body',()=>{
 const p=fixture(),other=structuredClone(p.parts.slice(2));
 setHairRegion(p,'front',{rootY:900,tipY:400,centerX:2000,radius:1});
 assert.deepEqual(p.parts[0].hairControl,p.parts[1].hairControl);
 assert.ok(p.parts[0].hairControl.tipY>=p.parts[0].hairControl.rootY+102.4);
 assert.deepEqual(p.parts.slice(2),other);
});
test('strand edits, disabling and saved settings stay in sync and survive serialization',()=>{
 const p=fixture(),first=hairParts(p,'front')[0];first.hairStrands=[{rootX:200,rootY:90,tipX:250,tipY:340,width:150,gain:1,delay:0}];syncHairShape(p,first);
 assert.deepEqual(p.parts[1].hairStrands,first.hairStrands);assert.notEqual(p.parts[1].hairStrands,first.hairStrands);
 first.savedHairStrands=first.hairStrands;delete first.hairStrands;syncHairShape(p,first);
 const saved=JSON.parse(JSON.stringify(p));assert.equal(saved.parts[1].hairStrands,undefined);assert.deepEqual(saved.parts[0].savedHairStrands,saved.parts[1].savedHairStrands);
});
