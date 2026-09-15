// Only use original pixels when their matching SVG has not been edited.
export function canonicalSvgText(text){
  let index=0;const ids=new Map();
  text=text.replace(/\bid="([^"]+)"/g,(_,id)=>{if(!ids.has(id))ids.set(id,`asset${index++}`);return `id="${ids.get(id)}"`;});
  text=text.replace(/url\(#([^)]+)\)/g,(_,id)=>`url(#${ids.get(id)||id})`).replace(/\bhref="#([^"]+)"/g,(_,id)=>`href="#${ids.get(id)||id}"`).replace(/>\s+</g,'><').trim();
  return text;
}
export async function svgSignature(text){
  text=canonicalSvgText(text);
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  return [...new Uint8Array(hash)].map(v=>v.toString(16).padStart(2,'0')).join('');
}
// XMLSerializer removes ElementTree's space before '/>'. Keep stored signatures
// compatible, and use the selected source pair to recover formatting-only changes.
export async function matchingRasterSource(part){
  if(part.rasterDisabled)return null;
  if(part.rasterSourceUrl&&part.rasterSignature&&await svgSignature(part.svgText)===part.rasterSignature)return part.rasterSourceUrl;
  const source=part.artworkSources?.[part.artworkSource];
  if(!source?.originalUrl||source.rasterDisabled||!source.svgText)return null;
  const normalized=text=>canonicalSvgText(text).replace(/\s+\/>/g,'/>');
  return normalized(part.svgText)===normalized(source.svgText)?source.originalUrl:null;
}
export async function rasterProject(project){
  if(project.settings?.renderSource!=='original'&&!project.parts.some(p=>p.renderSource==='original'))return project;
  const parts=[];
  for(const p of project.parts){
    const useOriginal=(p.renderSource||project.settings?.renderSource)==='original';
    let url=useOriginal&&p.role==='static'?await matchingRasterSource(p):null;
    if(!url){parts.push(p);continue;}
    try{
      if(!url.startsWith('data:')){
        const response=await fetch(url);if(!response.ok)throw Error('image missing');
        const blob=await response.blob();url=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob);});
      }
      if(!/^data:image\/png;base64,[a-zA-Z0-9+/=]+$/.test(url))throw Error('not PNG');
      parts.push({...p,svgText:`<svg xmlns="http://www.w3.org/2000/svg" width="${p.width}" height="${p.height}" viewBox="0 0 ${p.width} ${p.height}"><image width="${p.width}" height="${p.height}" href="${url}"/></svg>`});
    }catch{parts.push(p);}
  }
  return {...project,parts};
}
