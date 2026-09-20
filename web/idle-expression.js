import {inferredEar} from './accessory-targets.js';
export const earEnabled=part=>typeof part.earMotion==='boolean'?part.earMotion:inferredEar(part);
export function chooseEarLayer(project,target){
 if(target!=='auto'&&target!=='none'&&!project.parts.some(p=>p.id===target))return;
 for(const part of project.parts){if(target==='auto')delete part.earMotion;else part.earMotion=part.id===target;}
}
export function earLayerSelection(project){
 if(project.parts.every(p=>p.earMotion===undefined))return 'auto';
 return project.parts.find(p=>p.earMotion===true)?.id||'none';
}
export function idleGaze(phase){
 const t=((phase%1)+1)%1,keys=[[0,0],[.12,0],[.18,-.65],[.36,-.65],[.43,.25],[.55,.25],[.61,.9],[.80,.9],[.90,0],[1,0]];
 for(let i=1;i<keys.length;i++){const [end,b]=keys[i],[start,a]=keys[i-1];if(t<=end){const u=(t-start)/(end-start),ease=u*u*u*(u*(u*6-15)+10);return a+(b-a)*ease;}}
 return 0;
}
