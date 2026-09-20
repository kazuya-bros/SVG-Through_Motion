import {partLabel} from './part-label.js';
import {svgSignature,matchingRasterSource} from './raster-source.js';
const keys=['psd','original'];
const geometry=['x','y','width','height'];
const png=url=>typeof url==='string'&&(/^data:image\/png;base64,[a-zA-Z0-9+/=]+$/.test(url)||/^\/assets\/[a-f0-9]{32}\/originals\/p\d+\.png$/.test(url));
export function normalizeArtworkSources(part,sanitize){
 if(!keys.includes(part.artworkSource)||!part.artworkSources)return {};
 const sources={};
 for(const key of keys){
  const a=part.artworkSources[key];
  if(!a||!geometry.every(k=>Number.isFinite(a[k])&&Math.abs(a[k])<=20000)||a.width<=0||a.height<=0||typeof a.svgText!=='string'||!png(a.originalUrl))continue;
  sources[key]={...Object.fromEntries(geometry.map(k=>[k,a[k]])),svgText:sanitize(a.svgText,`choice-${part.id}-${key}-`),originalUrl:a.originalUrl,paths:Math.max(0,Math.min(1000000,+a.paths||0)),rasterDisabled:!!a.rasterDisabled};
 }
 return sources[part.artworkSource]?{artworkSource:part.artworkSource,artworkSources:sources}:{};
}
export async function selectArtworkSource(part,key){
 const next=part.artworkSources?.[key],old=part.artworkSources?.[part.artworkSource];
 if(!next||!old||key===part.artworkSource)return false;
 // Preserve current vector edits in their own choice, and preserve placement.
 const matching=await matchingRasterSource(part);
 old.svgText=part.svgText;old.paths=part.paths;old.originalUrl=matching||part.rasterSourceUrl||part.originalUrl||old.originalUrl;
 old.rasterDisabled=!matching;
 const sx=part.width/old.width,sy=part.height/old.height,dx=part.x-old.x,dy=part.y-old.y;
 const signature=await svgSignature(next.svgText);
 Object.assign(part,next,{x:next.x+dx,y:next.y+dy,width:next.width*sx,height:next.height*sy,artworkSource:key,
  rasterSourceUrl:next.originalUrl,rasterSignature:signature,rasterDisabled:!!next.rasterDisabled});
 delete part.spatialBounds;
 return true;
}

export function installArtworkSources(api){
 const entry=document.createElement('button');entry.id='reviewArtworkSources';entry.className='wide';entry.type='button';entry.textContent='PSD／元絵の切り抜きを切り替え';entry.hidden=true;
 document.getElementById('layers').before(entry);
 function refresh(){entry.hidden=true;}
 entry.onclick=()=>open();
 function open(){
  const project=api.project(),parts=project?.parts.filter(p=>p.artworkSources);if(!parts?.length)return;
  const dialog=document.createElement('dialog');dialog.className='artwork-source-dialog';dialog.setAttribute('aria-labelledby','artworkSourceTitle');
  dialog.innerHTML='<h2 id="artworkSourceTitle">PSD／元絵の切り抜きを切り替え</h2><p>動かすパーツはPSDの絵を使います。気になるパーツだけ、元絵の切り抜きと比べて変更できます。</p><label>切り替えるパーツ<select id="artworkSourcePart"></select></label><div class="artwork-source-options"></div><p class="artwork-source-hint" role="status"></p><footer><button class="primary" id="applyArtworkSource" type="button">選んだ絵を使う</button><button id="closeArtworkSource" type="button">閉じる</button></footer>';
  const select=dialog.querySelector('select'),options=dialog.querySelector('.artwork-source-options'),hint=dialog.querySelector('.artwork-source-hint'),apply=dialog.querySelector('#applyArtworkSource');let choice,busy=false;
  for(const p of parts){const o=document.createElement('option');o.value=p.id;o.textContent=partLabel(p);select.append(o);}
  if(parts.some(p=>p.id===api.selected()))select.value=api.selected();
  const urls=[];
  function show(){
   urls.splice(0).forEach(URL.revokeObjectURL);options.replaceChildren();
   const part=parts.find(p=>p.id===select.value);choice=part.artworkSource;
   const assets=Object.values(part.artworkSources),x=Math.min(...assets.map(a=>a.x)),y=Math.min(...assets.map(a=>a.y)),w=Math.max(...assets.map(a=>a.x+a.width))-x,h=Math.max(...assets.map(a=>a.y+a.height))-y;
   for(const key of keys){
    const a=part.artworkSources[key],card=document.createElement('label');card.className='artwork-source-card';
    const radio=document.createElement('input');radio.type='radio';radio.name='artworkChoice';radio.value=key;radio.checked=choice===key;radio.disabled=!a;
    const title=document.createElement('strong');title.textContent=key==='psd'?'PSDのパーツ':'元絵の切り抜き';
    card.append(radio,title);
    if(a){
     const img=document.createElement('img');img.alt=title.textContent+'：'+part.name;
     // Both alternatives use the same frame to make missing/added areas visible.
     const art=!a.rasterDisabled&&a.originalUrl.startsWith('data:')?`<image x="${a.x}" y="${a.y}" width="${a.width}" height="${a.height}" href="${a.originalUrl}"/>`:`<g transform="translate(${a.x} ${a.y})">${a.svgText}</g>`;
     const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}">${art}</svg>`;
     const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));urls.push(url);img.src=url;card.append(img);
    }
    const note=document.createElement('small');note.textContent=!a?'このパーツの比較用の絵はありません。':key==='psd'?'隠れていた部分の補完を含みます。':'元絵で見えている部分だけです。動かすと隙間が出ることがあります。';card.append(note);
    radio.onchange=()=>{choice=key;update();};options.append(card);
   }
   update();
  }
  function update(){
   const part=parts.find(p=>p.id===select.value);apply.disabled=choice===part.artworkSource;
   hint.textContent='使用中：'+(part.artworkSource==='psd'?'PSDのパーツ':'元絵の切り抜き')+'。変更はプロジェクトの保存で保持できます。';
  }
  select.onchange=show;
  apply.onclick=async()=>{
   if(project!==api.project()){dialog.close();return;}busy=true;apply.disabled=true;select.disabled=true;
   try{await selectArtworkSource(parts.find(p=>p.id===select.value),choice);await api.changed();show();hint.textContent='選んだ絵を反映しました。プレビューで動きを確認できます。';}
   catch(error){hint.textContent='変更できませんでした：'+error.message;apply.disabled=false;}
   finally{busy=false;select.disabled=false;}
  };
  dialog.querySelector('#closeArtworkSource').onclick=()=>{if(!busy)dialog.close();};
  dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
  dialog.addEventListener('close',()=>{urls.forEach(URL.revokeObjectURL);dialog.remove();});
  document.body.append(dialog);show();dialog.showModal();
 }
 return {refresh,open};
}
