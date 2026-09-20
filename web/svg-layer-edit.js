import {sanitizeSvg} from './assets.js';
import {chooseAccessory} from './accessory-targets.js';
import {validateMotionLinks} from './motion-links.js';
import {normalizeSecondary} from './secondary-motion.js';
const svg=(w,h,content)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${content}</svg>`;
const placed=(p,x,y,prefix)=>`<g transform="translate(${p.x-x} ${p.y-y})" opacity="${p.opacity??1}">${sanitizeSvg(p.svgText,prefix)}</g>`;
const editable=p=>p&&!p.closedSvgText&&!p.openSvgText&&!p.faceBase&&!p.blinkOverlay&&!p.faceOverlay&&!/^(mouth|lash-|iris-|white-|brow-)/.test(p.role);
export const canMergeLayer=editable;
function vectorOnly(p){p.rasterDisabled=true;p.renderSource='svg';for(const k of ['spatialBounds','rasterSourceUrl','rasterSignature','originalUrl','artworkSources','artworkSource'])delete p[k];p.paths=(p.svgText.match(/<path\b/g)||[]).length;}
export async function layerRevision(project){const value=JSON.stringify(project.parts);const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(hash)].map(v=>v.toString(16).padStart(2,'0')).join('');}
export function applyLayerEdit(project,c){
 const p=project.parts.find(p=>p.id===c.part_id);
 if(c.operation==='target'){chooseAccessory(project,c.kind,c.target);return;}
 if(!p)throw Error('対象レイヤーが見つかりません');
 if(c.operation==='secondary'){
  const v=c.secondary;
  if(!v||typeof v!=='object'||Object.keys(v).some(k=>!['enabled','amount','cycles','range','region','direction'].includes(k)))throw Error('揺れの設定が不正です');
  if(v.enabled!==undefined&&typeof v.enabled!=='boolean')throw Error('揺れの有効設定が不正です');
  for(const [key,min,max]of [['amount',0,100],['cycles',1,4],['range',10,100]])if(v[key]!==undefined&&(!Number.isFinite(v[key])||v[key]<min||v[key]>max||key==='cycles'&&!Number.isInteger(v[key])))throw Error('揺れの数値が範囲外です');
  if(v.direction!==undefined&&!['horizontal','vertical','diag-down','diag-up'].includes(v.direction))throw Error('揺れ方向が不正です');
  const next=normalizeSecondary({...p.secondaryMotion,...v});if(v.region&&!next.region)throw Error('揺れの範囲が不正です');p.secondaryMotion=next;return;
 }
 if(c.operation==='pivot'){if(!Number.isFinite(c.x)||!Number.isFinite(c.y)||c.x<0||c.y<0||c.x>project.width||c.y>project.height)throw Error('支点の座標が不正です');p.pivotX=c.x;p.pivotY=c.y;return;}
 if(c.operation==='stroke'){
  if(!editable(p))throw Error('目・口の差分は専用の補正画面で編集してください');
  if(!['paint','erase'].includes(c.mode)||!/^#[a-f0-9]{6}$/i.test(c.color||'')||!Number.isFinite(c.size)||c.size<1||c.size>200||!Array.isArray(c.points)||!c.points.length||c.points.length>10000||c.points.some(v=>!Array.isArray(v)||v.length!==2||v.some(n=>!Number.isFinite(n)||Math.abs(n)>20000)))throw Error('ブラシの指定が不正です');
  const r=c.size/2,x=Math.min(p.x,Math.max(0,Math.min(...c.points.map(v=>v[0]-r)))),y=Math.min(p.y,Math.max(0,Math.min(...c.points.map(v=>v[1]-r))));
  const right=Math.max(p.x+p.width,Math.min(project.width,Math.max(...c.points.map(v=>v[0]+r)))),bottom=Math.max(p.y+p.height,Math.min(project.height,Math.max(...c.points.map(v=>v[1]+r)))),w=right-x,h=bottom-y;
  if(w<=0||h<=0)throw Error('キャンバス内を塗ってください');
  const id='brush-'+crypto.randomUUID(),d=c.points.map((v,i)=>`${i?'L':'M'}${(v[0]-x).toFixed(3)} ${(v[1]-y).toFixed(3)}`).join(' ')+(c.points.length===1?' l.001 0':'');
  const path=color=>`<path d="${d}" fill="none" stroke="${color}" stroke-width="${c.size}" stroke-linecap="round" stroke-linejoin="round"/>`;
  // Bake source opacity exactly once, including when expanding layer bounds.
  const old=placed(p,x,y,'old-');
  const content=c.mode==='paint'?old+path(c.color):`<defs><mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}" mask-type="luminance"><rect width="${w}" height="${h}" fill="white"/>${path('black')}</mask></defs><g mask="url(#${id})">${old}</g>`;
  const result=sanitizeSvg(svg(w,h,content),'');Object.assign(p,{x,y,width:w,height:h,opacity:1,svgText:result});vectorOnly(p);return;
 }
 if(c.operation==='merge'){
  const q=project.parts.find(p=>p.id===c.other_id),i=project.parts.indexOf(p),j=project.parts.indexOf(q);
  if(!editable(p)||!editable(q)||Math.abs(i-j)!==1||p.visible!==q.visible)throw Error('隣り合う通常レイヤー同士を結合できます。目・口・顔の下地は専用の補正を使ってください');
  const pair=[p,q].sort((a,b)=>project.parts.indexOf(a)-project.parts.indexOf(b)),x=Math.min(p.x,q.x),y=Math.min(p.y,q.y),w=Math.max(p.x+p.width,q.x+q.width)-x,h=Math.max(p.y+p.height,q.y+q.height)-y;
  const text=sanitizeSvg(svg(w,h,pair.map((v,n)=>placed(v,x,y,'merge'+n+'-')).join('')),'');
  const next=project.parts.filter(v=>v!==q).map(v=>({...v})),merged=next.find(v=>v.id===p.id);
  Object.assign(merged,{x,y,width:w,height:h,opacity:1,svgText:text,name:String(c.name||p.name).slice(0,150)});vectorOnly(merged);
  for(const v of next)for(const key of ['followPart','motionLink']){if(v[key]===q.id)v[key]=p.id;if(v[key]===v.id){delete v[key];if(key==='motionLink'){delete v.motionLinkMode;delete v.motionLinkAnchor;}}}
  validateMotionLinks({...project,parts:next});
  project.parts=next;
  return;
 }
 throw Error('未対応のレイヤー操作です');
}
