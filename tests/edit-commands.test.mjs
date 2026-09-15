import test from 'node:test';
import assert from 'node:assert/strict';
import {editableParts,applyShapeEdit,createCorrectionSession} from '../web/edit-commands.js';
import {createAssistController} from '../web/assist-controller.js';
import {reviewPoses} from '../web/review-renderer.js';

const fixture=()=>({id:'sample',width:400,height:500,settings:{mouthTuning:{open:{width:1.2}},duration:4},parts:[
  {id:'p000',role:'mouth',x:120,y:160,width:50,height:30,svgText:'original',closedSvgText:'<svg><path d="M 0 5 L 25 6 L 50 5" stroke="#332211" stroke-width="2"/></svg>'},
  {id:'p001',role:'lash-l',x:100,y:90,width:60,height:20,svgText:'original',closedSvgText:'<svg><path d="M 0 0 Q 30 20 60 0"/></svg>'},
  {id:'p002',role:'hair',x:20,y:10,width:180,height:140,svgText:'keep',metadata:'keep'}]});

test('AI finish applies a reviewed result once and supports undo; manual conflicts keep the candidate separate',async()=>{
 for(const conflict of [false,true]){
  const original=fixture(),candidate=createCorrectionSession(original,'auto-test');candidate.edit(0,'p001',{y:4});
  let live=structuredClone(original),adoptions=0;if(conflict)live.parts[2].opacity=.5;
  const run=createAssistController({snapshot:async()=>structuredClone(live),adopt:async p=>{live=structuredClone(p);adoptions++;},
   load:async()=>({version:1,state:{session:candidate.serialize(),meta:{auto_apply:true,targets:['p001']},receipts:[],review:{revision:1,saved:{url:'review.zip'}}}})});
  await run({operation:'resume',session_id:'auto-test'});
  const cmd={operation:'finish',operation_id:'finish',session_id:'auto-test',revision:1,assessment:{status:'pass',notes:'Checked',evidence:['review-03.png']}};
  const result=await run(cmd);assert.deepEqual(await run(cmd),result);
  assert.equal(result.applied,!conflict);assert.equal(adoptions,conflict?0:1);
  if(conflict){assert.equal(live.parts[2].opacity,.5);assert.equal(result.active,true);assert.match(result.workflow.apply_error,/変わっています/);}
  else{assert.equal(live.parts[1].lidAdjust.y,4);await run({operation:'undo',operation_id:'undo',session_id:'auto-test'});assert.deepEqual(live,original);}
 }
});

test('failed persistence after automatic adoption restores the live edit and pending candidate',async()=>{
 const original=fixture(),candidate=createCorrectionSession(original,'auto-fail');candidate.edit(0,'p001',{y:4});let live=structuredClone(original);
 const run=createAssistController({snapshot:async()=>structuredClone(live),adopt:async p=>{live=structuredClone(p);},store:async()=>{throw Error('disk full');},
 load:async()=>({version:1,state:{session:candidate.serialize(),meta:{auto_apply:true,targets:['p001']},receipts:[],review:{revision:1,saved:{url:'review.zip'}}}})});
 await run({operation:'resume',session_id:'auto-fail'});
 await assert.rejects(run({operation:'finish',operation_id:'finish',session_id:'auto-fail',revision:1,assessment:{status:'pass',notes:'Checked',evidence:['review-03.png']}}),/disk full/);
 assert.deepEqual(live,original);assert.equal((await run({operation:'inspect'})).session.active,true);
});

test('typed edits preserve sources, unrelated parts and open mouth; donors expose transforms only',()=>{
  const source=fixture(),before=structuredClone(source),parts=editableParts(source);
  assert.equal(parts[0].generated,true);assert.equal(parts[1].generated,false);
  assert.equal(parts[1].fields.curve,undefined);
  const changed=applyShapeEdit(source,'p000',{y:3,curve:2,width:.9});
  assert.deepEqual(source,before);assert.equal(changed.settings.mouthTuning.open.width,1.2);
  assert.deepEqual(changed.parts,source.parts);
  const eye=applyShapeEdit(changed,'p001',{angle:5});assert.equal(eye.parts[1].lidAdjust.angle,5);
  assert.deepEqual(eye.parts[2],source.parts[2]);
  for(const values of [{y:31},{width:NaN},{x:true},{x:'1'},{curve:2},{unknown:1},{}])
    assert.throws(()=>applyShapeEdit(source,'p001',values));
});

test('candidate revisions, conflict detection, full restore and undo do not overwrite later manual edits',()=>{
  const original=fixture(),session=createCorrectionSession(original,'session');
  session.edit(0,'p000',{y:4});assert.equal(session.inspect().revision,1);
  assert.throws(()=>session.edit(0,'p000',{y:5}),/revision/);
  session.restore(1,0);assert.deepEqual(session.candidate(),original);
  session.edit(2,'p001',{x:3});
  const manual=structuredClone(original);manual.parts[2].opacity=.7;
  assert.throws(()=>session.apply(3,manual),/変わっています/);
  const applied=session.apply(3,original);session.applied(applied);
  assert.throws(()=>session.edit(3,'p000',{y:3}),/終了/);
  const later=structuredClone(applied);later.settings.duration=5;
  assert.throws(()=>session.undo(later),/適用後/);
  assert.deepEqual(session.undo(applied),original);
});

test('reloaded SVG identifier prefixes do not conflict but real artwork changes do',()=>{
 const original=fixture();original.parts[2].svgText='<svg><defs><path id="asset" d="M0 0L1 1"/></defs><use href="#asset"/></svg>';
 const session=createCorrectionSession(original,'reload');session.edit(0,'p001',{y:3});
 const reloaded=structuredClone(original);reloaded.parts[2].svgText=original.parts[2].svgText.replaceAll('asset','part2-asset');
 assert.equal(session.apply(1,reloaded).parts[1].lidAdjust.y,3);
 reloaded.parts[2].svgText=reloaded.parts[2].svgText.replace('L1 1','L2 2');assert.throws(()=>session.apply(1,reloaded),/変わっています/);
});

test('controller deduplicates successful mutation IDs and guards stale sessions',async()=>{
  const source=fixture();let saved;
  const execute=createAssistController({snapshot:async()=>structuredClone(source),saveCandidate:async p=>{saved=p;return {path:'test'};}});
  const start={operation:'start',operation_id:'first'};
  const session=await execute(start);assert.deepEqual(await execute(start),session);
  const edit={operation:'edit',operation_id:'edit1',session_id:session.session_id,revision:0,part_id:'p000',values:{y:4}};
  const edited=await execute(edit);assert.equal(edited.revision,1);assert.deepEqual(await execute(edit),edited);
  await assert.rejects(execute({...edit,values:{y:5}}),/operation_id/);
  await assert.rejects(execute({...edit,operation_id:'edit2',session_id:'old'}),/session_id/);
  await assert.rejects(execute({operation:'apply',operation_id:'apply1',session_id:session.session_id,revision:1}),/比較描画/);
  await execute({operation:'save',session_id:session.session_id,revision:1});assert.equal(saved.settings.mouthTuning.closed.y,4);
  assert.equal(source.settings.mouthTuning.closed,undefined);
});

test('review poses cover transitions without depending on clocks or live audio',()=>{
  const settings={duration:4,blink:true,talking:true,sway:2,breathe:3};
  const result=reviewPoses(settings);assert.equal(result.length,17);
  assert.deepEqual(result,reviewPoses(settings));
  assert.deepEqual(result.slice(0,4).map(p=>p.pose.blinkL),[0,.5,.8,1]);
  assert.deepEqual(result.slice(4,8).map(p=>p.pose.mouth),[0,.25,.5,1]);
  assert.equal(result[8].pose.blinkR,1);assert.equal(result[8].pose.mouth,0);
});

test('checkpoint round-trip keeps candidate history and original donor; restore removes replacement',()=>{
  const source=fixture(),s=createCorrectionSession(source,'session');
  s.replace(0,'p000','<svg>replacement</svg>');s.edit(1,'p001',{y:3});
  const data=JSON.parse(JSON.stringify(s.serialize()));const resumed=createCorrectionSession(data.base,data.id,data);
  assert.deepEqual(resumed.candidate(),s.candidate());resumed.restore(2,0);
  assert.deepEqual(resumed.candidate(),source);
});

test('persistent controller resumes, deduplicates and limits edits even after restore',async()=>{
  let stored,version=0;
  const api={snapshot:async()=>fixture(),store:async(id,expected,state)=>{assert.equal(expected,version);stored=structuredClone(state);return {version:++version};},load:async()=>({version,state:stored})};
  let run=createAssistController(api);let state=await run({operation:'start',operation_id:'s',targets:['p000']});
  const sid=state.session_id;
  await assert.rejects(run({operation:'edit',operation_id:'bad',session_id:sid,revision:0,part_id:'p001',values:{y:1}}),/対象外/);
  const edit={operation:'edit',operation_id:'e1',session_id:sid,revision:0,part_id:'p000',values:{y:2}};
  const result=await run(edit);run=createAssistController(api);await run({operation:'resume',session_id:sid});
  assert.deepEqual(await run(edit),result);
  await run({operation:'edit',operation_id:'e2',session_id:sid,revision:1,part_id:'p000',values:{y:3}});
  await run({operation:'edit',operation_id:'e3',session_id:sid,revision:2,part_id:'p000',values:{y:4}});
  await assert.rejects(run({operation:'edit',operation_id:'e4',session_id:sid,revision:3,part_id:'p000',values:{y:5}}),/3回/);
  await run({operation:'restore',operation_id:'r',session_id:sid,revision:3,target_revision:0});
  await assert.rejects(run({operation:'edit',operation_id:'e5',session_id:sid,revision:4,part_id:'p000',values:{y:5}}),/3回/);
});

test('failed checkpoint rolls back candidate and its edit budget',async()=>{
  let fail=false;
  const run=createAssistController({snapshot:async()=>fixture(),store:async(sid,v)=>{if(fail)throw Error('disk full');return {version:v+1};}});
  const state=await run({operation:'start',operation_id:'start'}),sid=state.session_id;
  fail=true;await assert.rejects(run({operation:'edit',operation_id:'e',session_id:sid,revision:0,part_id:'p000',values:{y:3}}),/disk full/);
  const current=(await run({operation:'inspect'})).session;assert.equal(current.revision,0);assert.deepEqual(current.workflow.edits,{});
  fail=false;const retried=await run({operation:'edit',operation_id:'e',session_id:sid,revision:0,part_id:'p000',values:{y:3}});assert.equal(retried.revision,1);
});

test('generation is opt-in and cancelled or foreign assets cannot attach',async()=>{
  const run=createAssistController({snapshot:async()=>fixture(),asset:async()=>({request_id:'foreign'})});
  const state=await run({operation:'start',operation_id:'start'}),sid=state.session_id;
  await assert.rejects(run({operation:'claim',operation_id:'no-vision',session_id:sid,capabilities:{inspect_images:false,edit_project:true}}),/画像確認/);
  await run({operation:'claim',operation_id:'claim',session_id:sid,capabilities:{inspect_images:true,edit_project:true,generate_images:true}});
  await assert.rejects(run({operation:'prepare_asset',operation_id:'request',session_id:sid,revision:0,part_id:'p000'}),/有効では/);
  await assert.rejects(run({operation:'attach_asset',operation_id:'foreign',session_id:sid,revision:0,asset_id:'a'}),/一致しません/);
  await run({operation:'cancel',operation_id:'cancel',session_id:sid});
  await assert.rejects(run({operation:'attach_asset',operation_id:'late',session_id:sid,revision:0,asset_id:'a'}),/終了/);
});
