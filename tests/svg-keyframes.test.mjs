import test from 'node:test';
import assert from 'node:assert/strict';
import {validateTrack,sampleTrack,pathData,demoTrack,retimeEyeTrack} from '../web/svg-keyframes.js';
test('exact targets and endpoints survive interpolation without mutation',()=>{
  for(const kind of ['eye','mouth']){
    const track=validateTrack(demoTrack(kind)),before=JSON.stringify(track);
    for(const frame of track.frames)assert.deepEqual(sampleTrack(track,frame.at).points,frame.points);
    assert.deepEqual(sampleTrack(track,-1).points,track.frames[0].points);
    assert.deepEqual(sampleTrack(track,2).points,track.frames.at(-1).points);
    assert.equal(JSON.stringify(track),before);
    assert.equal(pathData(track.commands,sampleTrack(track,.3).points).replace(/[^MCZ]/g,''),'MCCZ');
  }
});
test('0.3 uses twenty percent of the 0.25 to 0.5 interval and boundaries are continuous',()=>{
  const track=demoTrack(),result=sampleTrack(track,.3);
  assert.equal(result.from,.25);assert.equal(result.to,.5);assert.ok(Math.abs(result.ratio-.2)<1e-12);
  result.points.forEach((n,i)=>assert.ok(Math.abs(n-(track.frames[1].points[i]*.8+track.frames[2].points[i]*.2))<1e-10));
  for(const t of [.25,.5,.75]){
    const a=sampleTrack(track,t-1e-8),b=sampleTrack(track,t+1e-8);
    a.points.forEach((n,i)=>assert.ok(Math.abs(n-b.points[i])<.0001));
  }
});
test('editing a middle target affects only adjacent intervals and leaves endpoints intact',()=>{
  const track=demoTrack(),edited=structuredClone(track);edited.frames[2].points[3]+=12;
  for(const t of [0,.1,.25,.75,.9,1])assert.deepEqual(sampleTrack(track,t),sampleTrack(edited,t));
  for(const t of [.3,.5,.7])assert.notDeepEqual(sampleTrack(track,t).points,sampleTrack(edited,t).points);
  assert.deepEqual(sampleTrack(track,.5,{endpointsOnly:true}),sampleTrack(edited,.5,{endpointsOnly:true}));
});
test('invalid topology, duplicate times and nonfinite values are rejected before adoption',()=>{
  const base=demoTrack();
  for(const mutate of [t=>t.commands[1]='L',t=>t.frames[2].at=.25,t=>t.frames[2].points.pop(),t=>t.frames[2].points[0]=NaN,t=>t.frames[0].at=.1]){
    const bad=structuredClone(base);mutate(bad);assert.throws(()=>validateTrack(bad));
  }
  assert.throws(()=>sampleTrack(base,NaN));
  const copy=validateTrack(base);copy.frames[0].points[0]=99;assert.notEqual(base.frames[0].points[0],99);
});
test('eye closes without a final upward reversal or a residual opening',()=>{
  const track=demoTrack('eye');
  const bezier=(a,b,c,d,u)=>(1-u)**3*a+3*(1-u)**2*u*b+3*(1-u)*u*u*c+u**3*d;
  for(const u of [.1,.25,.5,.75,.9]){
    let previousY=-Infinity,previousGap=Infinity;
    for(let i=0;i<=100;i++){
      const p=sampleTrack(track,i/100).points;
      const upper=bezier(p[1],p[3],p[5],p[7],u),lower=bezier(p[13],p[11],p[9],p[7],u);
      assert.ok(upper>=previousY-1e-9,'upper eyelid must not move back up while closing');
      assert.ok(lower-upper>=-1e-9&&lower-upper<=previousGap+1e-9,'opening must shrink');
      previousY=upper;previousGap=lower-upper;
    }
    assert.ok(Math.abs(previousGap)<1e-9);
  }
  const p=sampleTrack(track,1).points;
  assert.deepEqual(p.slice(2,6),[p[10],p[11],p[8],p[9]]);
});
const gap=p=>.375*(p[9]+p[11]-p[3]-p[5]);
function earlyClosingEye(){
  const track=demoTrack('eye'),open=track.frames[0].points,closed=track.frames.at(-1).points;
  track.frames=track.frames.map(f=>({at:f.at,points:open.map((v,i)=>v+(closed[i]-v)*(1-(1-f.at)**3))}));
  return track;
}
test('timing correction makes closure proportional without changing endpoints or input',()=>{
  const raw=earlyClosingEye(),before=JSON.stringify(raw),fixed=retimeEyeTrack(raw);
  assert.deepEqual(fixed.frames[0],raw.frames[0]);assert.deepEqual(fixed.frames.at(-1),raw.frames.at(-1));
  assert.equal(JSON.stringify(raw),before);
  for(let i=0;i<=100;i++){
    const value=i/100,opening=gap(sampleTrack(fixed,value).points)/gap(raw.frames[0].points);
    assert.ok(Math.abs(opening-(1-value))<1e-9);
  }
  assert.ok(gap(sampleTrack(raw,.5).points)/gap(raw.frames[0].points)<.2);
});
test('zero correction is exact, partial strength is bounded, and invalid eye tracks fail',()=>{
  const raw=earlyClosingEye();assert.deepEqual(retimeEyeTrack(raw,0),raw);
  const partial=retimeEyeTrack(raw,.5),full=retimeEyeTrack(raw,1);
  for(const value of [.25,.5,.75]){
    const a=gap(sampleTrack(raw,value).points),b=gap(sampleTrack(partial,value).points),c=gap(sampleTrack(full,value).points);
    assert.ok(a<=b&&b<=c);
  }
  for(const amount of [NaN,-1,2])assert.throws(()=>retimeEyeTrack(raw,amount));
  const invalid=structuredClone(raw);invalid.frames[2].points[3]=-100;
  assert.throws(()=>retimeEyeTrack(invalid));assert.throws(()=>retimeEyeTrack(demoTrack('mouth')));
  const flat=structuredClone(raw);flat.frames.forEach(f=>{f.points=[...flat.frames[0].points];});
  assert.throws(()=>retimeEyeTrack(flat));
});
