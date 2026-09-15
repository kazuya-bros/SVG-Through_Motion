// Time-based attack/hold/release for file and TTS audio.
export class SpeechEnvelope {
  constructor(){this.reset();}
  reset(){this.level=0;this.last=null;this.lastVoice=-Infinity;this.active=false;}
  sample(samples,gain=5,now=performance.now(),gate=.009){
    let sum=0;for(const value of samples)sum+=value*value;
    const rms=samples.length?Math.sqrt(sum/samples.length):0;
    return this.step(Math.max(0,Math.min(1,(rms-gate)*gain)),now);
  }
  step(input,now){
    const dt=this.last===null?1/60:Math.max(0,Math.min(.1,(now-this.last)/1000));this.last=now;
    const value=Math.max(0,Math.min(1,input));
    if(value>=(this.active?.025:.05)){this.active=true;this.lastVoice=now;}
    if(now-this.lastVoice>90)this.active=false;
    const target=this.active?Math.max(.2,value):0;
    const tau=target>this.level?.035:.085;
    this.level+=(target-this.level)*(1-Math.exp(-dt/tau));
    if(!this.active&&this.level<.008)this.level=0;
    return this.level;
  }
}
