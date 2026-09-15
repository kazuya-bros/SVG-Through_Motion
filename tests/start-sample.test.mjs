import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleCopy,samplePreviewPose} from '../web/start-sample.js';
import {loopPose} from '../web/motion.js';
import {sampleMotionSettings} from '../web/natural-motion.js';

test('showcase keeps one quick hop while mouth and ears follow the long loop',()=>{
  const settings=sampleMotionSettings();
  let troughs=0;
  for(let i=1;i<600;i++){
    const t=i/100,p=samplePreviewPose(t,settings),slow=loopPose(t,{...settings,singleBounce:false});
    assert.equal(p.mouth,slow.mouth);assert.equal(p.earNaturalL,slow.earNaturalL);
    if(p.bounce<samplePreviewPose(t-.01,settings).bounce&&p.bounce<samplePreviewPose(t+.01,settings).bounce)troughs++;
    if(t>=1.38)assert.ok(Math.abs(p.bounce)<1e-8);
  }
  assert.equal(troughs,1);
  assert.ok(samplePreviewPose(.84,settings).bounce<-27);
  assert.deepEqual(samplePreviewPose(0,settings),samplePreviewPose(6,settings));
});

test('sample edits and replays are isolated, and never bring voice settings into the copy',()=>{
  const base={id:'template',parts:[{id:'eye',lidAdjust:{curve:.2}}],settings:{sway:.3},rig:{weights:[1]},voiceSettings:{engine:'browser'}};
  const first=sampleCopy(base),second=sampleCopy(base);
  first.parts[0].lidAdjust.curve=.9;first.settings.sway=4;first.rig.weights[0]=0;
  assert.equal(base.parts[0].lidAdjust.curve,.2);assert.equal(second.parts[0].lidAdjust.curve,.2);
  assert.equal(second.settings.sway,.3);assert.deepEqual(second.rig.weights,[1]);
  assert.notEqual(first.id,second.id);assert.notEqual(first.id,base.id);
  assert.equal(first.voiceSettings,undefined);
  assert.deepEqual(second.settings,sampleMotionSettings(base.settings));
  assert.equal(second.sampleMotionDefault,true);
  const saved=JSON.parse(JSON.stringify(second));
  for(const t of [0,.6,.84,1.2,2.5,4.4,6])assert.deepEqual(loopPose(t,saved.settings),samplePreviewPose(t,sampleMotionSettings(base.settings)));
});
