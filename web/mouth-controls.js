import {normalizeMouthTuning,vowels,vowelWeights} from './vowels.js';
import {closedProfile,taperedLine,lipHighlight} from './closed-mouth.js';
const clamp=v=>Math.max(0,Math.min(1,+v||0));
export function mouthOpenMotion(pose,settings){
 const tune=normalizeMouthTuning(settings.mouthTuning),weights=vowelWeights(pose,settings),t=clamp(pose.mouth),blend=t*t*(3-2*t);
 // The closed artwork has its own transform. Moving it must not also move
 // the compressed source mouth that is crossfading underneath it.
 const get=k=>(settings.vowels?weights.reduce((sum,w,i)=>sum+w*tune.vowels[vowels[i]][k],0):tune.open[k])*blend;
 return {x:get('x'),y:get('y'),angle:get('angle')};
}
export function mouthOpenMatrix(part,pose,settings){
 const m=mouthOpenMotion(pose,settings),a=m.angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a),x=part.x+part.width/2,y=part.y+part.height/2;
 return [c,s,-s,c,x+m.x-c*x+s*y,y+m.y-s*x-c*y];
}
export function closedMouthArtwork(part,settings){
 let svg=part.closedSvgText||'',v=normalizeMouthTuning(settings.mouthTuning).closed;
 const profile=closedProfile(svg);
 if(profile)svg=taperedLine(profile,v)+lipHighlight(profile,v);
 else if(v.thickness!==1)svg=svg.replace(/stroke-width="([\d.]+)"/g,(_,w)=>`stroke-width="${+w*v.thickness}"`);
 const x=part.width/2,y=part.height/2;
 return `<g transform="translate(${x+v.x} ${y+v.y}) rotate(${v.angle}) scale(${v.width} ${v.height}) translate(${-x} ${-y})">${svg}</g>`;
}
export function mouthTeethSvg(part,key,settings){
 if(!part.mouthInteriorSvg)return '';
 const v=normalizeMouthTuning(settings.mouthTuning).vowels[key],w=part.width,h=part.height,id=`teeth-${part.id}-${key}`;
 return `<defs><mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}" style="mask-type:alpha">${part.mouthInteriorSvg}</mask></defs><g mask="url(#${id})"><rect x="${w*(1-v.teethWidth)/2}" y="${h*v.teethY}" width="${w*v.teethWidth}" height="${h*v.teethHeight}" rx="${h*.04}" fill="${v.teethColor}"/></g>`;
}
export function mouthTeethOpacity(key,pose,settings){return vowelWeights(pose,settings)[vowels.indexOf(key)]*normalizeMouthTuning(settings.mouthTuning).vowels[key].teeth;}
