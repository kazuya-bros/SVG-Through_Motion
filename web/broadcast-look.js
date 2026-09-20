// Runtime appearance is separate from the character's editable source artwork.
export const defaultLook=()=>({outline:false,outline_layers:3,outline_color_count:2,outline_color2:'#ffffff',outline_color3:'#ffffff',outline_color:'#8c91db',outline_width:6,light:'none',light_strength:.5,light_color:'#e3be97',light_asset_id:null,emotion:'none',emotion_strength:.6,emotion_asset_id:null,blush_x:0,blush_y:0,blush_scale:1,blush_spacing:1,blush_rotation:0,sweat_x:.36,sweat_y:-.25,sweat_scale:.12,sweat_rotation:0,image_scale:.22,image_x:0,image_y:-.15,image_rotation:0,colors:[]});
export const lookAssets=look=>[look?.light_asset_id,look?.emotion_asset_id].filter(Boolean);
export const colorable=part=>! /^(mouth|lash-|iris-|white-)/.test(part.role||'')&&!!part.svgText;
export function rgb(hex){return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255)}
export function hsl([r,g,b]){const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min,l=(max+min)/2;let h=0,s=0;if(d){s=d/(1-Math.abs(2*l-1));h=max===r?((g-b)/d+6)%6:max===g?(b-r)/d+2:(r-g)/d+4;h/=6}return[h,s,l]}
function fromHsl([h,s,l]){h=(h%1+1)%1;const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((h*6)%2-1)),m=l-c/2,a=h<1/6?[c,x,0]:h<2/6?[x,c,0]:h<3/6?[0,c,x]:h<4/6?[0,x,c]:h<5/6?[x,0,c]:[c,0,x];return '#'+a.map(v=>Math.round(Math.max(0,Math.min(1,v+m))*255).toString(16).padStart(2,'0')).join('')}
export function replaceColor(color,rule){
 if(!/^#[0-9a-f]{6}$/i.test(color||''))return color;
 if(color.toLowerCase()===rule.from_color.toLowerCase())return rule.to_color;
 const a=hsl(rgb(color)),b=hsl(rgb(rule.from_color)),t=hsl(rgb(rule.to_color)),distance=Math.min(Math.abs(a[0]-b[0]),1-Math.abs(a[0]-b[0]));
 // Preserve near-black linework and neutral highlights. A neutral source can be selected explicitly.
 if(a[2]<.18||a[2]>.96||Math.abs(a[1]-b[1])>.5||(a[1]>.12&&b[1]>.12&&distance>rule.tolerance))return color;
 if((a[1]<.12)!==(b[1]<.12))return color;
 return fromHsl([a[0]+t[0]-b[0],Math.max(0,Math.min(1,a[1]+t[1]-b[1])),Math.max(0,Math.min(1,a[2]+t[2]-b[2]))]);
}
export function colorProject(project,rules){
 if(!rules?.length)return project;
 const parts=project.parts.map(p=>{const rule=rules.find(r=>r.part_id===p.id);if(!rule||!colorable(p))return p;
  const copy={...p,renderSource:'svg',rasterDisabled:true};
  for(const key of ['svgText','openSvgText','closedSvgText'])if(p[key]){const root=new DOMParser().parseFromString(p[key],'image/svg+xml').documentElement;for(const el of root.querySelectorAll('[fill],[stroke],[stop-color]')){if(el.closest('mask,clipPath'))continue;for(const attr of ['fill','stroke','stop-color'])if(el.hasAttribute(attr))el.setAttribute(attr,replaceColor(el.getAttribute(attr),rule))}copy[key]=new XMLSerializer().serializeToString(root)}return copy;
 });return {...project,parts};
}
export function palette(part,all=false){
 const count=new Map();if(!part?.svgText)return [];
 const root=new DOMParser().parseFromString(part.svgText,'image/svg+xml').documentElement;
 for(const el of root.querySelectorAll('[fill],[stroke],[stop-color]')){if(el.closest('mask,clipPath'))continue;for(const attr of ['fill','stroke','stop-color']){const key=el.getAttribute(attr)?.toLowerCase();if(!/^#[0-9a-f]{6}$/.test(key||''))continue;const [,sat,l]=hsl(rgb(key));if(all||l>.2&&l<.96)count.set(key,{count:(count.get(key)?.count||0)+1,sat})}}
 return [...count].sort((a,b)=>(b[1].sat>.2)-(a[1].sat>.2)||b[1].count-a[1].count).slice(0,all?Infinity:32).map(v=>v[0]);
}
