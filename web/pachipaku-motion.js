// Adapted via PachiPakuGen. See THIRD_PARTY_NOTICES.md and licenses/.
// Anime2.5DRig d4882586: Copyright (c) 2026 hakoniwa, MIT.
// PuruPuruPNGTuber 9dc1e735: Copyright 2026 masa, Apache-2.0.
// Changes: analytic periodic spring response, restrained amplitudes, no live state,
// no copied renderer/assets; shared by Canvas and standalone SVG exports.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function periodicSpring(phase,amplitude,omega,k,c) {
  const real=k-omega*omega,imag=c*omega;
  return amplitude*k/Math.hypot(real,imag)*Math.sin(phase-Math.atan2(imag,real));
}
export function doubleSpring(phase,amplitude,duration,limit) {
  const omega=2*Math.PI/Math.max(1,duration),target=amplitude*Math.sin(phase);
  // PachiPakuGen stepHairStrandSpring: K=70/16, C=9/1.3, gains 2.2/3.
  return {stiff:clamp((target-periodicSpring(phase,amplitude,omega,70,9))*2.2,-limit,limit),
    soft:clamp((target-periodicSpring(phase,amplitude,omega,16,1.3))*3,-limit,limit)};
}
// Normalize the complex response AFTER blending the two springs. This keeps
// amplitude independent of speed, damping and cancellation between the springs.
export function normalizedSpring(phase,u,duration,cycles=1,softness=.5){
  cycles=Math.round(clamp(cycles,1,4));softness=clamp(softness,0,1);
  const omega=2*Math.PI*cycles/Math.max(1,duration),elastic=1.5-softness,damping=1.25-softness*.65;
  const error=(k,c,gain)=>{k*=elastic;c*=damping;const real=k-omega*omega,imag=c*omega,den=real*real+imag*imag;return [(1-k*real/den)*gain,k*imag/den*gain];};
  const hard=error(70,9,2.2),soft=error(16,1.3,3),a=hard[0]*(1-u)+soft[0]*u,b=hard[1]*(1-u)+soft[1]*u;
  return (a*Math.sin(phase*cycles)+b*Math.cos(phase*cycles))/Math.max(1e-9,Math.hypot(a,b));
}
export function rootedWave(phase,u,seed,duration) {
  // Adapted from PachiPakuGen drawMotionLabWaveWarp / pyokopyokoHairShift.
  // Slow tempo, integer cycles for seamless exports, normalized amplitude.
  const cycles=rate=>Math.max(1,Math.round(160/60*.25*rate*duration));
  const tau=Math.PI*2;
  const drift=Math.sin(phase*cycles(.42)+tau*(u*.82*.35+seed));
  const wave=Math.sin(phase*cycles(.72)+tau*(u*1.55*.35+.16+seed*.7));
  return clamp(u*1.25,0,1)*u*(5.2*drift+2.8*wave)/8;
}
export const restrainedDefaults={rigMode:'stable',headTilt:1.2,headYaw:.15,headNod:.5,bodyFollow:.2,hairBend:3,sway:.3,breathe:1,hairMethod:'spring',frontHair:4,backHair:9,hairTip:2,armSwing:0,springCycles:1,springSoftness:.5};
