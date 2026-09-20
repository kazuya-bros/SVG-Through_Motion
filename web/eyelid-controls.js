const clamp=(v,a,b,d)=>Number.isFinite(+v)?Math.max(a,Math.min(b,+v)):d;
export const lidDefaults={x:0,y:0,angle:0,width:1,height:1,thickness:1,curve:0,spikes:1,lashAmount:1,lashCount:null,color:null};
export function normalizeLid(v={}){return {x:clamp(v.x,-30,30,0),y:clamp(v.y,-30,30,0),angle:clamp(v.angle,-30,30,0),width:clamp(v.width,.5,1.5,1),height:clamp(v.height,.3,3,1),thickness:clamp(v.thickness,.3,2,1),curve:clamp(v.curve,-15,15,0),spikes:clamp(v.spikes,0,2,1),lashAmount:clamp(v.lashAmount,0,2,1),lashCount:v.lashCount==null?null:Math.round(clamp(v.lashCount,0,16,2)),color:typeof v.color==='string'&&/^#[0-9a-f]{6}$/i.test(v.color)?v.color.toLowerCase():null};}
export const lashPresets={light:{thickness:.65,spikes:.7,lashAmount:.4},natural:{thickness:1,spikes:1,lashAmount:1},full:{thickness:1.15,spikes:1,lashAmount:2}};
export const generatedLash=part=>part?.closedSource!=='psd'&&!!lidProfile(part?.closedSvgText);
export const lashColor=part=>normalizeLid(part?.lidAdjust).color||part?.closedSvgText?.match(/\bfill="(#[0-9a-f]{6})"/i)?.[1]||'#3b2929';
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
  if(generatedLash(part)){
   if(v.lashCount!==null){
    const source=groups.slice(1).filter(a=>a.length===6),body=groups[0];
    if(source.length&&v.lashCount!==source.length){
     groups.splice(1);const xs=[...centers.keys()],left=Math.min(...xs),right=Math.max(...xs);
     const lean=Math.sign(source[0][2]-(source[0][0]+source[0][4])/2)||1;
     for(let i=0;i<v.lashCount;i++){
      const u=v.lashCount===1?.35:.12+.70*i/(v.lashCount-1),x=lean<0?left+(right-left)*u:right-(right-left)*u;
      const key=xs.reduce((best,k)=>Math.abs(k-x)<Math.abs(best-x)?k:best,xs[0]),j=xs.indexOf(key),mid=centers.get(key);
      const half=Math.min((right-left)*.025,(right-left)*.28/Math.max(1,v.lashCount)),base=mid+Math.abs(body[j*2+1]-mid)*.5;
      const donor=source[Math.min(source.length-1,Math.floor(i/Math.max(1,v.lashCount)*source.length))],length=Math.abs(donor[3]-(donor[1]+donor[5])/2);
      groups.push([x+half,base,x+lean*half,base+length,x-half,base]);
     }
    }
   }
   const tufts=groups.slice(1).filter(a=>a.length===6),amount=v.lashCount===null?v.lashAmount:1;
   const scaleTuft=(a,weight)=>{const x=(a[0]+a[4])/2,y=(a[1]+a[5])/2;return a.map((value,i)=>(i%2?y:x)+(value-(i%2?y:x))*weight);};
   const extras=[];
   if(amount>1){
    const xs=[...centers.keys()],left=Math.min(...xs),right=Math.max(...xs);
    tufts.forEach((a,i)=>{
     const x=(a[0]+a[4])/2,dx=(i%2?1:-1)*(right-left)*.16,nx=x+dx;
     if(nx<=left+2||nx>=right-2)return;
     const nearest=x=>xs.reduce((best,key)=>Math.abs(key-x)<Math.abs(best-x)?key:best,xs[0]);
     const dy=centers.get(nearest(nx))-centers.get(nearest(x));
     extras.push(scaleTuft(a.map((value,j)=>value+(j%2?dy:dx)),amount-1));
    });
   }
   for(let i=groups.length-1;i>0;i--)if(groups[i].length===6){if(!amount)groups.splice(i,1);else groups[i]=scaleTuft(groups[i],Math.min(1,amount));}
   groups.push(...extras);
  }
  groups.forEach((a,index)=>{
   if(index===0){for(let i=0;i<a.length;i+=2){const mid=centers.get(a[i]);a[i+1]=mid+(a[i+1]-mid)*v.thickness+bend(a[i]);}}
   else if(a.length===6){const base=(a[1]+a[5])/2;for(let i=0;i<6;i+=2)a[i+1]=base+(a[i+1]-base)*v.spikes+bend(a[i]);}
  });
  const path=groups.map(a=>'M '+Array.from({length:a.length/2},(_,i)=>a.slice(i*2,i*2+2).map(v=>v.toFixed(3)).join(' ')).join(' L ')+' Z').join(' ');
  result=result.replace(profile.match[0],`d="${path}"`).replace(/^<svg\b[^>]*>/,'<g>').replace(/<\/svg>\s*$/,'</g>');
  if(generatedLash(part)&&v.color)result=result.replace(/\bfill="#[0-9a-f]{6}"/gi,`fill="${v.color}"`);
 }
 // Preserve the original donor and its geometry; adjustments remain reversible.
 return `<g transform="translate(${v.x} ${v.y}) translate(${cx} ${cy}) rotate(${v.angle}) scale(${v.width} ${v.height*(profile?1:v.thickness)}) translate(${-cx} ${-cy})">${result}</g>`;
}
