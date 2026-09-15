const clamp=(v,a,b,d)=>Number.isFinite(+v)?Math.max(a,Math.min(b,+v)):d;
export const lidDefaults={x:0,y:0,angle:0,width:1,height:1,thickness:1,curve:0,spikes:1};
export function normalizeLid(v={}){return {x:clamp(v.x,-30,30,0),y:clamp(v.y,-30,30,0),angle:clamp(v.angle,-30,30,0),width:clamp(v.width,.5,1.5,1),height:clamp(v.height,.3,3,1),thickness:clamp(v.thickness,.3,2,1),curve:clamp(v.curve,-15,15,0),spikes:clamp(v.spikes,0,2,1)};}
export function lidProfile(svg){
 const match=svg?.match(/\bd="([^"]+)"/);if(!match||/[a-km-yk-z]/i.test(match[1].replace(/[MLZ]/g,'')))return null;
 const groups=match[1].split(/Z\s*/).filter(v=>v.trim()).map(v=>[...v.matchAll(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi)].map(m=>+m[0]));
 const a=groups[0];if(!a||a.length<64||a.length%4)return null;
 const n=a.length/4;
 for(let i=0;i<n;i++)if(Math.abs(a[2*i]-a[a.length-2-2*i])>.01)return null;
 return {match,groups,n};
}
export function closedLashArtwork(part){
 const svg=part.closedSvgText;if(!svg||!part.lidAdjust)return svg;
 const v=normalizeLid(part.lidAdjust),profile=lidProfile(svg),cx=part.width/2,cy=part.height*.75;
 let result=svg;
 if(profile){
  const {groups,n}=profile,centers=new Map();
  for(let i=0;i<n;i++)centers.set(groups[0][2*i],(groups[0][2*i+1]+groups[0][groups[0].length-1-i*2])/2);
  const bend=x=>v.curve*(1-((x-cx)/Math.max(1,part.width/2))**2);
  groups.forEach((a,index)=>{
   if(index===0){for(let i=0;i<a.length;i+=2){const mid=centers.get(a[i]);a[i+1]=mid+(a[i+1]-mid)*v.thickness+bend(a[i]);}}
   else if(a.length===6){const base=(a[1]+a[5])/2;for(let i=0;i<6;i+=2)a[i+1]=base+(a[i+1]-base)*v.spikes+bend(a[i]);}
  });
  const path=groups.map(a=>'M '+Array.from({length:a.length/2},(_,i)=>a.slice(i*2,i*2+2).map(v=>v.toFixed(3)).join(' ')).join(' L ')+' Z').join(' ');
  result=result.replace(profile.match[0],`d="${path}"`).replace(/^<svg\b[^>]*>/,'<g>').replace(/<\/svg>\s*$/,'</g>');
 }
 // Preserve the original donor and its geometry; adjustments remain reversible.
 return `<g transform="translate(${v.x} ${v.y}) translate(${cx} ${cy}) rotate(${v.angle}) scale(${v.width} ${v.height*(profile?1:v.thickness)}) translate(${-cx} ${-cy})">${result}</g>`;
}
