import {rms,clamp} from './motion.js?v=mouth-editor-9';

export function microphoneEnvelope(samples,gain=10,gate=.01,previous=0){
  const target=clamp(Math.max(0,rms(samples)-clamp(gate,0,.1))*clamp(gain,1,40));
  const level=clamp(previous);
  return level+(target-level)*(target>level?.7:.25);
}
