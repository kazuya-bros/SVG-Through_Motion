import {resizeBox} from './transform-box.js';
import {normalizeMouthTuning} from './vowels.js';
import {closedProfile} from './closed-mouth.js';
import {mouthScale} from './motion.js?v=mouth-editor-9';

export const transformPoint=(m,p)=>({x:m[0]*p.x+m[2]*p.y+m[4],y:m[1]*p.x+m[3]*p.y+m[5]});
export function inversePoint(m,p){const d=m[0]*m[3]-m[1]*m[2],x=p.x-m[4],y=p.y-m[5];return {x:(m[3]*x-m[2]*y)/d,y:(m[0]*y-m[1]*x)/d};}
export function mouthFrame(part,settings,key){
 const tune=normalizeMouthTuning(settings.mouthTuning),closed=key==='closed',v=closed?tune.closed:key==='open'?tune.open:tune.vowels[key];
 const a=v.angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a),cw=closed?mouthScale(settings.previewAmount??0,settings,{vowel:'a'})[0]:1;
 const h=v.height,offset=(settings.mouthOffsetY||0)*(settings.imageWidth||1024)/1024;
 return {value:v,closed,cw,matrix:[cw*c*v.width,s*v.width,-cw*s*h,c*h,part.x+part.width/2+cw*v.x,part.y+part.height/2+v.y+offset]};
}
export function dragMouth(part,settings,key,handle,start,point,options={}){
 const tune=normalizeMouthTuning(settings.mouthTuning),v=key==='closed'?tune.closed:key==='open'?tune.open:tune.vowels[key];
 const f=mouthFrame(part,settings,key),m=f.matrix,local=inversePoint(m,point),origin=inversePoint(m,start);
 if(handle.startsWith('box-')){const r=resizeBox(m,options.bounds,handle,start,point,{...options,minX:(key==='closed'?.4:.25)/v.width,maxX:1.8/v.width,minY:(key==='closed'?.3:.1)/v.height,maxY:(key==='closed'?3:1.8)/v.height});v.width*=r.sx;v.height*=r.sy;v.x+=r.x/f.cw;v.y+=r.y;}
 if(handle==='move'){v.x+=(point.x-start.x)/f.cw;v.y+=point.y-start.y;}
 if(handle==='width')v.width*=Math.max(.01,Math.abs(local.x))/(part.width/2);
 if(handle==='height')v.height*=Math.max(.01,Math.abs(local.y))/(part.height/2);
 if(handle==='rotate'){let d=Math.atan2(point.y-m[5],(point.x-m[4])/f.cw)-Math.atan2(start.y-m[5],(start.x-m[4])/f.cw);v.angle+=Math.atan2(Math.sin(d),Math.cos(d))*180/Math.PI;}
 if(handle==='thickness')v.thickness+=(local.y-origin.y)/5;
 if(handle==='curve')v.curve+=local.y-origin.y;
 if(handle==='corner-left'||handle==='corner-right'){
  const profile=closedProfile(part.closedSvgText);
  if(profile){
   const side=handle==='corner-left'?'left':'right';
   // Corner height and width change together without jumping on pointer-down.
   if(Math.abs(origin.x)>1)v.width*=Math.max(.1,local.x/origin.x);
   v[side]+=local.y-origin.y;
  }
 }
 if(handle==='teeth-move')v.teethY+=(local.y-origin.y)/part.height;
 if(handle==='teeth-width')v.teethWidth=2*Math.abs(local.x)/part.width;
 if(handle==='teeth-height')v.teethHeight=(local.y+part.height/2)/part.height-v.teethY;
 return normalizeMouthTuning(tune);
}

// One undo step per gesture, including multi-event drags and typed values.
export function tuningHistory(limit=60){
 let undo=[],redo=[];
 const copy=v=>structuredClone(v);
 return {commit(before,after){if(JSON.stringify(before)===JSON.stringify(after))return;undo.push(copy(before));if(undo.length>limit)undo.shift();redo=[];},
 undo(current){if(!undo.length)return current;redo.push(copy(current));return undo.pop();},
 redo(current){if(!redo.length)return current;undo.push(copy(current));return redo.pop();},
 snapshot(){return copy({undo,redo});},restore(saved){undo=copy(saved.undo);redo=copy(saved.redo);},clear(){undo=[];redo=[];},get canUndo(){return !!undo.length;},get canRedo(){return !!redo.length;}};
}
