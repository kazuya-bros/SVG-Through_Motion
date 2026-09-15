import test from 'node:test';
import assert from 'node:assert/strict';
import {applyMotionEdit} from '../web/assist-motion.js';
import {createCorrectionSession} from '../web/edit-commands.js';
import {createAssistController} from '../web/assist-controller.js';
import {pairedReviewPoses} from '../web/review-renderer.js';
const fixture=()=>({id:'test',settings:{duration:4,sway:1,breathe:1,blink:true,mouthTuning:{open:{width:1.2}},background:'transparent'},voiceSettings:{engine:'voicevox',ttsConfig:{selected:'voicevox'}},parts:[{id:'p000',role:'mouth',width:50,height:30,closedSvgText:'<svg><path d="M0 5L50 5" stroke="black" stroke-width="2"/></svg>'}]});
test('motion edits preserve voice, artwork and output settings and reject unrelated fields',()=>{
 const p=fixture(),q=applyMotionEdit(p,{sway:.3,blink:false,hairMethod:'spring'});
 assert.equal(p.settings.sway,1);assert.equal(q.settings.sway,.3);assert.deepEqual(q.voiceSettings,p.voiceSettings);assert.deepEqual(q.parts,p.parts);assert.equal(q.settings.background,'transparent');
 for(const bad of [{engine:'browser'},{gain:3},{background:'white'},{sway:true},{springCycles:1.5},{hairMethod:'unknown'},{sway:NaN},{}])assert.throws(()=>applyMotionEdit(p,bad));
});
test('motion and face share serialization, revision restore and undo',()=>{
 const p=fixture(),s=createCorrectionSession(p,'motion');s.motion(0,{sway:.3});s.edit(1,'p000',{y:2});
 const restored=createCorrectionSession(p,'motion',s.serialize());assert.equal(restored.candidate().settings.sway,.3);assert.equal(restored.candidate().settings.mouthTuning.closed.y,2);
 const applied=restored.apply(2,p);restored.applied(applied);assert.deepEqual(restored.undo(applied),p);
 const older=s.serialize();delete older.history[0].state.motion;const legacy=createCorrectionSession(p,'motion',older);legacy.restore(2,0);assert.deepEqual(legacy.candidate(),p);
});
test('only from-inputs sessions expose and accept motion edits',async()=>{
 for(const mode of ['finish','from_inputs']){
  const run=createAssistController({snapshot:async()=>fixture()});const s=await run({operation:'start',operation_id:'start',mode});
  assert.equal(!!s.motion,mode==='from_inputs');
  const command={operation:'motion',operation_id:'motion',session_id:s.session_id,revision:0,settings:{sway:.3}};
  if(mode==='finish')await assert.rejects(run(command),/最初から/);
  else {assert.equal(s.workflow.auto_apply,true);const r=await run(command);assert.equal(r.motion.values.sway,.3);assert.deepEqual(await run(command),r);await assert.rejects(run({...command,operation_id:'late'}),/revision/);}
 }
});
test('from-inputs finish requires motion evidence and adopts only after review; undo includes motion',async()=>{
 const p=fixture(),s=createCorrectionSession(p,'from-inputs');s.motion(0,{sway:.3});let live=structuredClone(p),updated;
 const run=createAssistController({snapshot:async()=>structuredClone(live),adopt:async p=>{live=structuredClone(p);},updated:(state,op)=>{updated=op;},load:async()=>({version:1,state:{session:s.serialize(),meta:{mode:'from_inputs',auto_apply:true,motion_edits:1,targets:['p000']},receipts:[],review:{revision:1,saved:{url:'review.zip'}}}})});
 await run({operation:'resume',session_id:'from-inputs'});
 const finish={operation:'finish',operation_id:'finish',session_id:'from-inputs',revision:1,assessment:{status:'pass',notes:'Reviewed',evidence:['review-03.png']}};
 await assert.rejects(run(finish),/モーション/);finish.assessment.evidence.push('review-10.png');const result=await run(finish);
 assert.equal(result.applied,true);assert.equal(updated,'finish');assert.equal(live.settings.sway,.3);assert.deepEqual(live.voiceSettings,p.voiceSettings);
 await run({operation:'undo',operation_id:'undo',session_id:'from-inputs'});assert.deepEqual(live,p);
});
test('comparison uses candidate motion at equal loop progress, including changed duration',()=>{
 const poses=pairedReviewPoses({duration:4,sway:1,breathe:1},{duration:8,sway:3,breathe:1});
 assert.equal(poses.length,17);assert.equal(poses[11].pose.sway,1);assert.equal(poses[11].candidatePose.sway,3);
 assert.equal(poses[3].pose.blinkL,1);assert.equal(poses[3].candidatePose.blinkL,1);
});
