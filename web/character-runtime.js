import {prepareCanvasRenderer} from './canvas-renderer.js?v=mouth-editor-9';
import {loopPose} from './motion.js?v=mouth-editor-9';

export const CHARACTER_RUNTIME={id:'svg-through-canvas',apiVersion:1,behaviorVersion:'1.0.0'};
export function characterPose(timeSeconds,settings,{speech,blink}={}){
 const live=!!speech;
 const pose=loopPose(timeSeconds,live?{...settings,talking:false,vowels:false}:settings);
 if(live){
  pose.mouth=speech.active?Math.max(0,Math.min(1,Number(speech.mouth)||0)):0;
  delete pose.vowelWeights;
  if(speech.active&&['a','i','u','e','o'].includes(speech.vowel))pose.vowel=speech.vowel;
 }
 if(blink){pose.blinkL=Math.max(0,Math.min(1,Number(blink.left)||0));pose.blinkR=Math.max(0,Math.min(1,Number(blink.right)||0));}
 return pose;
}

// Host supplies the clock and speech. The renderer is the editor's renderer,
// not a second implementation of hair/ear/face physics.
export async function prepareCharacterRuntime(scene,options={}){
 const copy=structuredClone(scene);
 copy.settings={...copy.settings,background:options.background??'transparent'};
 const renderer=await prepareCanvasRenderer(copy,options.maxEdge??Math.max(copy.width,copy.height),options);
 renderer.draw(characterPose(0,copy.settings,{speech:{active:false,mouth:0}}));
 return {canvas:renderer.canvas,
  render({timeSeconds,speech={active:false,mouth:0},blink}={timeSeconds:0}){renderer.draw(characterPose(timeSeconds,copy.settings,{speech,blink}));},
  drawPose:pose=>renderer.draw(pose),dispose:()=>renderer.dispose()};
}
