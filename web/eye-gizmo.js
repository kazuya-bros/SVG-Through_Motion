import {normalizeLid,lidProfile} from './eyelid-controls.js';
import {resizeBox} from './transform-box.js';
import {transformPoint,inversePoint} from './mouth-gizmo.js';

export function eyeFrame(part){
 const v=normalizeLid(part.lidAdjust),profile=lidProfile(part.closedSvgText),cx=part.width/2,cy=part.height*.75;
 const a=v.angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a),sy=v.height*(profile?1:v.thickness);
 const matrix=[c*v.width,s*v.width,-s*sy,c*sy,part.x+cx+v.x,part.y+cy+v.y];
 let points=[{x:-cx,y:0},{x:0,y:0},{x:cx,y:0}],halfThickness=3;
 if(profile){
  const body=profile.groups[0],n=profile.n;
  points=[0,Math.floor((n-1)/2),n-1].map(i=>{const x=body[i*2],y=(body[i*2+1]+body[body.length-1-i*2])/2;return {x:x-cx,y:y-cy+v.curve*(1-((x-cx)/Math.max(1,cx))**2)};});
  const i=Math.floor((n-1)/2);halfThickness=Math.max(.5,Math.abs(body[i*2+1]-body[body.length-1-i*2])/2);
 }
 return {v,profile,matrix,points,halfThickness,world:points.map(p=>transformPoint(matrix,p))};
}
export function dragEye(part,handle,start,point,options={}){
 const f=eyeFrame(part),v={...f.v},a=inversePoint(f.matrix,start),b=inversePoint(f.matrix,point);
 if(handle.startsWith('box-')){const r=resizeBox(f.matrix,options.bounds,handle,start,point,{...options,minX:.5/v.width,maxX:1.5/v.width,minY:.3/v.height,maxY:3/v.height});v.width*=r.sx;v.height*=r.sy;v.x+=r.x;v.y+=r.y;}
 if(handle==='move'){v.x+=point.x-start.x;v.y+=point.y-start.y;}
 if(handle==='width'&&Math.abs(a.x)>1)v.width*=Math.max(.1,b.x/a.x);
 if(handle==='curve'&&f.profile)v.curve+=(b.y-a.y)/Math.max(.1,1-(f.points[1].x/Math.max(1,part.width/2))**2);
 if(handle==='thickness')v.thickness+=(b.y-a.y)/(f.profile?f.halfThickness:Math.max(1,part.height/2));
 if(handle==='rotate'){
  const cx=f.matrix[4],cy=f.matrix[5];let delta=Math.atan2(point.y-cy,point.x-cx)-Math.atan2(start.y-cy,start.x-cx);
  delta=Math.atan2(Math.sin(delta),Math.cos(delta));v.angle+=delta*180/Math.PI;
 }
 return normalizeLid(v);
}
