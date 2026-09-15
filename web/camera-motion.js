// MediaPipe face geometry is a column-major 4x4 canonical-to-camera matrix.
// Strip uniform scale; translation and camera distance must not drive the rig.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const wrap=v=>Math.atan2(Math.sin(v),Math.cos(v));
export function cameraAngles(matrix){
 const m=matrix?.data;
 if(matrix?.rows!==4||matrix?.columns!==4||m?.length!==16||!Array.from(m).every(Number.isFinite))return null;
 const sx=Math.hypot(m[0],m[1],m[2]),sy=Math.hypot(m[4],m[5],m[6]),sz=Math.hypot(m[8],m[9],m[10]);
 if(Math.min(sx,sy,sz)<1e-6)return null;
 return {yaw:Math.asin(clamp(-m[2]/sx,-1,1)),pitch:Math.atan2(m[6]/sy,m[10]/sz),roll:Math.atan2(m[1]/sx,m[0]/sx)};
}
export function createCameraMotion(){
 let neutral=null,current=null,last=null,filtered={yaw:0,pitch:0,headRoll:0};
 return {
  reset(){neutral=current=last=null;filtered={yaw:0,pitch:0,headRoll:0};},
  recenter(){if(!current)return false;neutral={...current};filtered={yaw:0,pitch:0,headRoll:0};return true;},
  update(matrix,now,{strength=.5,mirror=false}={}){
   current=cameraAngles(matrix);
   if(!current){last=null;filtered={yaw:0,pitch:0,headRoll:0};return {};}
   if(!neutral)neutral={...current};
   const gain=Number.isFinite(strength)?clamp(strength,0,1):.5,sign=mirror?-1:1;
   // A small dead zone removes resting jitter, with no jump at its boundary.
   const delta=key=>{const d=wrap(current[key]-neutral[key]);return Math.sign(d)*Math.max(0,Math.abs(d)-.012);};
   const target={yaw:sign*clamp(delta('yaw')/.5,-1,1)*.6*gain,
    pitch:-clamp(delta('pitch')/.4,-1,1)*.45*gain,
    headRoll:-sign*clamp(delta('roll')/.5,-1,1)*6*gain};
   const dt=last===null?80:clamp(now-last,0,200),alpha=1-Math.exp(-dt/160);last=now;
   for(const key of Object.keys(target))filtered[key]+=alpha*(target[key]-filtered[key]);
   if(gain===0)filtered={yaw:0,pitch:0,headRoll:0};
   return {...filtered};
  }
 };
}
export function applyCameraPose(pose,camera,settings={}){
 if(!camera)return pose;
 const result={...pose,...camera};
 if(Number.isFinite(camera.yaw)){
  result.pitch=clamp((Number(settings.headPitch)||0)+camera.pitch,-1,1);
  result.bodyRoll=camera.headRoll*.15;
  result.nod=0;
 }
 return result;
}
