// Microphone input uses one open-mouth drawing, independent of voice volume.
export class MicrophoneMouth {
 constructor(){this.level=0;this.last=null;this.lastSound=-Infinity;this.open=false;this.started=0;}
 sample(samples,threshold=.01,now=performance.now()){
  let sum=0;for(const value of samples)sum+=value*value;
  const rms=samples.length?Math.sqrt(sum/samples.length):0;
  const gate=Math.max(0,Number(threshold)||0);
  if(rms>0&&rms>=(this.open?gate*.7:gate)){
   if(!this.open)this.started=now;
   this.open=true;this.lastSound=now;
  }else if(now-this.lastSound>100)this.open=false;
  const dt=this.last===null?1/60:Math.max(0,Math.min(.1,(now-this.last)/1000));this.last=now;
  // Start each phrase open, then alternate at slightly varied syllable lengths.
  // Use elapsed time so delayed capture callbacks do not change the rhythm.
  let phase=Math.max(0,now-this.started)%1600,duration=420;
  for(const span of [380,440,360,420]){duration=span;if(phase<span)break;phase-=span;}
  const target=this.open&&phase<duration*.55?1:0,tau=target?.025:.03;
  this.level+=(target-this.level)*(1-Math.exp(-dt/tau));
  if(this.level>.99)this.level=1;
  if(this.level<.01)this.level=0;
  return this.level;
 }
}
