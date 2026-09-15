// Optional base-pose depth, shared by all facial variants. No donor depth switch.
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,Number.isFinite(+v)?+v:0));
const smooth=v=>{v=clamp(v);return v*v*(3-2*v);};
export function normalizeDepth(field){
 if(!field||field.version!==1||!Number.isInteger(field.size)||field.size<2||field.size>65||!Array.isArray(field.values)||field.values.length!==field.size**2||!field.values.every(v=>Number.isFinite(v)&&v>=0&&v<=1)||!Number.isFinite(field.median)||field.median<0||field.median>1)return undefined;
 const parts={};for(const key of ['face','front','back','headwear'])if(Number.isFinite(field.parts?.[key]))parts[key]=clamp(field.parts[key]);
 return {version:1,size:field.size,values:[...field.values],median:field.median,parts};
}
export function depthAmount(p){return p.rig?.depth&&p.settings?.rigEnabled&&p.settings.depthEnabled===true?clamp(p.settings.depthStrength??1):0;}
export function sampleDepth(field,x,y,p){
 const n=field.size,gx=clamp(x/p.width)*(n-1),gy=clamp(y/p.height)*(n-1),i=Math.min(n-2,Math.floor(gx)),j=Math.min(n-2,Math.floor(gy)),u=gx-i,v=gy-j,a=field.values;
 return (a[j*n+i]*(1-u)+a[j*n+i+1]*u)*(1-v)+(a[(j+1)*n+i]*(1-u)+a[(j+1)*n+i+1]*u)*v;
}
export function depthFaceOffset(x,y,p,pose,w){
 const strength=depthAmount(p);if(!strength)return [0,0];
 // Segmented neck/torso are separate artwork, even when their top lies in the
 // broad face rig weights. Do not let face depth tug that backing layer.
 if(p.rig.segmented&&!p.parts.some(v=>v.faceBase||v.blinkOverlay||v.faceOverlay||/^(mouth|(?:iris|white|lash|brow)-[lr])$/.test(v.role||'')))return [0,0];
 const r=p.rig,field=r.depth,relief=clamp(field.median-sampleDepth(field,x,y,p),-.1,.1),gain=w*relief*r.faceWidth*strength;
 return [clamp(pose.yaw,-1,1)*gain*.8||0,-clamp(pose.pitch,-1,1)*gain*.55||0];
}
export function depthHairPoint(x,y,p,pose){
 const strength=depthAmount(p);if(!strength)return [x,y];
 const part=p.parts[0],group=p.deformGroup;
 const key=['front','back'].includes(group)?group:part?.independentAccessory&&/headwear|頭飾り/i.test(part.sourceLayerName||part.name||'')?'headwear':null;
 const r=p.rig,d=r.depth.parts[key];if(!key||!Number.isFinite(d))return [x,y];
 const depth=clamp(r.depth.median-d,-.6,.6),weight=1-smooth((y-r.neckY)/(p.height*.25)),gain=r.faceWidth*.04*strength*weight;
 return [x+clamp(pose.yaw,-1,1)*depth*gain,y-clamp(pose.pitch,-1,1)*depth*gain*.7];
}
