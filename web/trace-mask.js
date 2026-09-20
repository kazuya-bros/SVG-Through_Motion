// VTracer stacked masks sometimes place black canvas-minus-shape over a white
// canvas. Their antialiased rectangle edges leak white, making a colored frame.
// Replace that exact pair with the existing shape holes, without changing art.
export function isCanvasRing(path,width,height){
 const tokens=path.match(/[MLCZ]|[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g)||[];
 if(path.replace(/[MLCZ]|[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?|[\s,]/g,''))return false;
 let i=0,current=null,start=null;const corners=new Set();
 const point=()=>{const p=[+tokens[i++],+tokens[i++]];return p.every(Number.isFinite)?p:null;};
 while(i<tokens.length){const op=tokens[i++];
  if(op==='M'){if(current)return false;current=point();if(!current)return false;start=current;}
  else if(op==='L'||op==='C'||op==='Z'){
   if(!current)return false;const ps=[current];if(op==='Z')ps.push(start);else for(let n=0;n<(op==='C'?3:1);n++){const p=point();if(!p)return false;ps.push(p);}
   if(![0,width].some(x=>ps.every(p=>Math.abs(p[0]-x)<1e-6))&&![0,height].some(y=>ps.every(p=>Math.abs(p[1]-y)<1e-6)))return false;
   for(const p of ps)if([0,width].includes(p[0])&&[0,height].includes(p[1]))corners.add(p.join(','));current=ps.at(-1);
   if(op==='Z'&&i!==tokens.length)return false;
  }else return false;
 }
 return tokens.at(-1)==='Z'&&corners.size===4;
}
const cache=new Map();
// Generated contours use absolute M/L/C/Z and an optional translation. Joining
// each silhouette with the canvas cancels coincident edges, including when the
// artwork touches the crop boundary. Separate clips intersect complements;
// XOR of all black paths would incorrectly reveal their overlapping regions.
export function traceContour(path,transform,width,height){
 const shift=(transform||'translate(0,0)').match(/^translate\(\s*([-+\d.eE]+)[ ,]+([-+\d.eE]+)\s*\)$/);
 if(!shift)return null;
 const dx=Number(shift[1]),dy=Number(shift[2]);if(!Number.isFinite(dx)||!Number.isFinite(dy))return null;
 if(path.replace(/[MLCZ]|[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?|[\s,]/g,''))return null;
 const tokens=path.match(/[MLCZ]|[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g)||[],out=[];
 let i=0,open=false;
 while(i<tokens.length){
  const op=tokens[i++],n={M:2,L:2,C:6,Z:0}[op];if(n===undefined||(!open&&op!=='M')||(open&&op==='M'))return null;
  out.push(op);if(op==='Z'){open=false;continue;}open=true;
  for(let j=0;j<n;j++){
   if(i>=tokens.length||!Number.isFinite(+tokens[i]))return null;
   let v=+tokens[i++]+(j%2?dy:dx),edge=j%2?height:width;
   // VTracer rounds path points to .01 but retains fractional translations.
   if(Math.abs(v)<.02)v=0;else if(Math.abs(v-edge)<.02)v=edge;
   out.push(String(+v.toFixed(6)));
  }
 }
 return !open&&out.length?out.join(' '):null;
}
export function repairTraceMasks(text){
 if(typeof text!=='string'||!text.includes('<mask'))return text;
 if(cache.has(text))return cache.get(text);
 const fixed=text.replace(/<mask\b[^>]*>[\s\S]*?<\/mask>/g,maskText=>{
  if(!/id="[^"]*alpha-/.test(maskText))return maskText;
  const doc=new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${maskText}</svg>`,'image/svg+xml'),mask=doc.querySelector('mask');
  if(!mask||mask.getAttribute('mask-type')!=='luminance')return maskText;
  const [base,cut]=mask.children,w=+mask.getAttribute('width'),h=+mask.getAttribute('height');
  if(!base||!cut||base.localName!=='path'||cut.localName!=='path'||!(w>0&&h>0))return maskText;
  if(!/^#(?:fff|ffffff)$/i.test(base.getAttribute('fill')||'')||!/^#(?:000|000000)$/i.test(cut.getAttribute('fill')||''))return maskText;
  const plain=p=>p.localName==='path'&&![...p.attributes].some(a=>!['d','fill','transform'].includes(a.name));
  if(!plain(base)||!plain(cut)||!['','translate(0,0)'].includes(base.getAttribute('transform')||'')||!isCanvasRing(base.getAttribute('d')||'',w,h))return maskText;
  const match=(cut.getAttribute('d')||'').match(/^([^Z]+Z)\s*(M[\s\S]+)$/);
  if(match&&['','translate(0,0)'].includes(cut.getAttribute('transform')||'')&&isCanvasRing(match[1],w,h)){
   base.setAttribute('d',match[2]);cut.remove();return new XMLSerializer().serializeToString(mask);
  }
  const cuts=[];for(const child of [...mask.children].slice(1)){if(!/^#(?:000|000000)$/i.test(child.getAttribute('fill')||''))break;cuts.push(child);}
  const contours=cuts.map(p=>plain(p)?traceContour(p.getAttribute('d')||'',p.getAttribute('transform'),w,h):null);
  if(!contours.length||contours.some(p=>!p))return maskText;
  const ns='http://www.w3.org/2000/svg',defs=doc.createElementNS(ns,'defs');mask.insertBefore(defs,base);
  let layer=base;
  for(const [i,contour] of contours.entries()){
   const id=mask.id+'-crop-cut-'+i,clip=doc.createElementNS(ns,'clipPath'),shape=doc.createElementNS(ns,'path'),group=doc.createElementNS(ns,'g');
   clip.id=id;clip.setAttribute('clipPathUnits','userSpaceOnUse');shape.setAttribute('d',base.getAttribute('d')+' '+contour);shape.setAttribute('clip-rule','evenodd');clip.append(shape);defs.append(clip);
   group.setAttribute('clip-path',`url(#${id})`);layer.replaceWith(group);group.append(layer);layer=group;
  }
  for(const child of cuts)child.remove();return new XMLSerializer().serializeToString(mask);
 });
 if(cache.size>=64)cache.delete(cache.keys().next().value);cache.set(text,fixed);return fixed;
}
