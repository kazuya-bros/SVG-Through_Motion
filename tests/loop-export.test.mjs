import test from 'node:test';
import assert from 'node:assert/strict';
import {streamLoopMp4,streamLoopVideo} from '../web/loop-export.js';

test('WebM steps through a fixed 30fps timeline and requests a seekable balanced alpha encode',async()=>{
 const poses=[],settings={duration:1,talking:true};let spec,count=0;
 const renderer={canvas:{width:64,height:64,toBlob(fn){fn(new Blob(['png']));}},draw(pose){poses.push(pose);}};
 const request=async(url,options)=>{if(url==='/api/loop-exports'){spec=JSON.parse(options.body);return {json:async()=>({id:'webm'})};}if(options.method==='PUT'){count++;return {};}return {json:async()=>({url:'/done.webm'})};};
 assert.deepEqual(await streamLoopVideo(renderer,settings,request,()=>{},'webm-alpha'),{url:'/done.webm'});
 assert.deepEqual(spec,{frames:30,width:64,height:64,format:'webm-alpha',fps:30,quality:'balanced'});assert.equal(count,30);assert.equal(poses.length,30);assert.ok(poses.some(p=>p.mouth>0));
 await assert.rejects(streamLoopVideo(renderer,settings,request,()=>{},'bogus'),/形式/);
});

test('large loops upload one lossless frame at a time, then finalize',async()=>{
 let sent=0,drawn=0,active=0,total=0,finished=false;
 const png=new Blob([new Uint8Array(4*1024**2)],{type:'image/png'});
 const renderer={canvas:{width:1080,height:1080,toBlob(fn,type){assert.equal(type,'image/png');fn(png);}},draw(){assert.equal(active,0);drawn++;}};
 const request=async(url,options)=>{
  if(url==='/api/loop-exports')return {json:async()=>({id:'job'})};
  if(options.method==='PUT'){
   assert.equal(url,`/api/loop-exports/job/frames/${sent}`);assert.equal(drawn,sent+1);
   active++;await new Promise(r=>setTimeout(r,0));total+=options.body.size;sent++;active--;return {};
  }
  assert.equal(options.method,'POST');assert.equal(sent,180);finished=true;return {json:async()=>({url:'/done.mp4'})};
 };
 assert.deepEqual(await streamLoopMp4(renderer,{duration:6},request,()=>{}),{url:'/done.mp4'});
 assert.ok(total>190*1024**2);assert.equal(finished,true);
});

test('failed upload stops encoding without finalizing or rendering further frames',async()=>{
 let draws=0,aborted=false;
 const renderer={canvas:{width:16,height:16,toBlob(fn){fn(new Blob(['png']));}},draw(){draws++;}};
 await assert.rejects(streamLoopMp4(renderer,{duration:6},async(url,options)=>{
  if(url==='/api/loop-exports')return {json:async()=>({id:'job'})};
  if(options.method==='DELETE'){aborted=true;return {};}
  throw Error('connection lost');
 },()=>{}),/connection lost/);
 assert.equal(draws,1);assert.equal(aborted,true);
});
