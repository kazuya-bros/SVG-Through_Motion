// Generated closed-mouth polylines only. Custom SVG artwork keeps its own topology.
export function closedProfile(svg=''){
 if(/\btransform=|<(?:g|rect|circle|ellipse|polygon|polyline|image|use)\b/.test(svg))return null;
 const paths=[...svg.matchAll(/<path\b[^>]*>/g)];if(paths.length!==1)return null;
 const tag=paths[0][0],d=tag.match(/\bd="([^"]+)"/)?.[1];
 const color=tag.match(/\bstroke="(#[a-f\d]{6})"/i)?.[1],width=+(tag.match(/\bstroke-width="([\d.]+)"/)?.[1]||0);
 if(!d||!color||!width||!/^[ML\d.\s-]+$/.test(d))return null;
 const points=[...d.matchAll(/[ML]\s*([\d.-]+)\s+([\d.-]+)/g)].map(m=>({x:+m[1],y:+m[2]}));
 if(points.length<3||points.some((p,i)=>!Number.isFinite(p.x+p.y)||(i&&p.x<=points[i-1].x)))return null;
 return {points,color,width,left:points[0].x,right:points.at(-1).x};
}
export function closedPoints(profile,tuning){
 return profile.points.map(p=>{const u=(p.x-profile.left)/(profile.right-profile.left);
  return {x:p.x,y:p.y+tuning.left*(1-u)+tuning.right*u+tuning.curve*4*u*(1-u)};
 });
}
export function taperedLine(profile,tuning){
 const points=closedPoints(profile,tuning),sides=[[],[]];
 points.forEach((p,i)=>{
  const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],length=Math.hypot(b.x-a.x,b.y-a.y);
  const u=(p.x-profile.left)/(profile.right-profile.left);
  const radius=profile.width*tuning.thickness*.5*(1-tuning.taper+tuning.taper*Math.sin(Math.PI*u));
  const nx=-(b.y-a.y)/length*radius,ny=(b.x-a.x)/length*radius;
  sides[0].push({x:p.x+nx,y:p.y+ny});sides[1].push({x:p.x-nx,y:p.y-ny});
 });
 const path=[...sides[0],...sides[1].reverse()].map((p,i)=>`${i?'L':'M'}${p.x.toFixed(3)} ${p.y.toFixed(3)}`).join(' ')+'Z';
 return `<path d="${path}" fill="${tuning.color||profile.color}"/>`;
}

// A short lip glint follows the edited curve, including uneven mouth corners.
// Keep it in the closed artwork so its transform and opening fade stay shared.
export function lipHighlight(profile,tuning){
 if(!tuning.highlight)return '';
 const points=closedPoints(profile,tuning),span=profile.right-profile.left;
 const sample=x=>{const i=points.findIndex(p=>p.x>=x),b=points[Math.max(1,i)],a=points[Math.max(1,i)-1];return a.y+(b.y-a.y)*(x-a.x)/(b.x-a.x);};
 const sides=[[],[]],thickness=profile.width*tuning.thickness;
 for(let i=0;i<=16;i++){
  const u=i/16,x=profile.left+span*(.42+.16*u),y=sample(x)+thickness*.22;
  const radius=thickness*.65*Math.sin(Math.PI*u)**.65;
  sides[0].push({x,y:y-radius});sides[1].push({x,y:y+radius});
 }
 const d=[...sides[0],...sides[1].reverse()].map((p,i)=>`${i?'L':'M'}${p.x.toFixed(3)} ${p.y.toFixed(3)}`).join(' ')+'Z';
 return `<path data-lip-highlight="true" d="${d}" fill="#fff5e9" opacity=".94"/>`;
}
