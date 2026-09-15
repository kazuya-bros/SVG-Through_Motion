import {closedProfile} from './closed-mouth.js';
import {lidProfile} from './eyelid-controls.js';

// Only expose controls whose renderer can edit the supplied artwork.
export function eyeCapabilities(part){
 const profile=lidProfile(part?.closedSvgText);
 return {transform:!!part?.closedSvgText,curve:!!profile,thickness:!!profile,
  spikes:!!profile?.groups.slice(1).some(points=>points.length===6)};
}
export function mouthCapabilities(part){
 const native=part?.mouthMode==='source-open'&&!part.openSvgText;
 const profile=native&&closedProfile(part?.closedSvgText);
 const strokes=[...(part?.closedSvgText||'').matchAll(/<(?:path|line|polyline)\b[^>]*>/g)];
 const strokeWidth=strokes.some(([tag])=>/\bstroke="(?!none")[^"]+"/.test(tag)&&/\bstroke-width="[\d.]+"/.test(tag)&&! /\bstyle=/.test(tag));
 return {transform:!!(native&&part.closedSvgText),curve:!!profile,
  thickness:!!(native&&(profile||strokeWidth)),color:!!profile,transition:!!native};
}
