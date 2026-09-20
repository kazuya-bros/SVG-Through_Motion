import {applyLayerEdit,canMergeLayer,layerRevision} from './svg-layer-edit.js';
import {partLabel} from './part-label.js';
export function installSvgLayerEditor(api){
 let active=false,otherOpacity=.7;
 async function open(){
  if(active||!api.project())return;active=true;api.begin();
  const original=api.project(),revision=await layerRevision(original),draft={...original,parts:original.parts.map(p=>({...p}))},history=[],future=[],urls=new Map();let id=api.selected()||draft.parts[0].id,stroke=null,mode='paint',pan=null;
  const dialog=document.createElement('dialog');dialog.className='svg-layer-editor';dialog.innerHTML=`<header><h2>レイヤーの補正・結合</h2><button data-cancel>キャンセル</button><button data-apply class="primary">適用して戻る</button></header><div class="layer-editor-body"><aside><label>補正するレイヤー<select data-layer></select></label><label>他のレイヤーの表示濃度<input type="range" data-other-opacity min="0" max="100" value="${Math.round(otherOpacity*100)}"><output data-other-opacity-out>${Math.round(otherOpacity*100)}%</output></label><div class="row"><button data-mode="paint" class="active">描き足す</button><button data-mode="erase">消す</button><button data-mode="pick">スポイト</button><button data-mode="pan">移動</button></div><label>ブラシの色<input type="color" data-color value="#edcab7"></label><label>ブラシの大きさ<input type="range" data-size min="1" max="100" value="16"><output data-size-out>16 px</output></label><div class="row"><button data-undo>Undo</button><button data-redo>Redo</button><button data-fit>全体</button></div><hr><label>結合する隣のレイヤー<select data-merge-target></select></label><p class="tiny">絵の重なりを保ち、補正中のレイヤーの動きにまとめます。</p><button data-merge>レイヤーを結合</button><p class="tiny">ホイール：拡大・縮小<br>移動ツール／中ボタンドラッグ：移動</p><p data-status role="status"></p></aside><div class="layer-editor-stage"><svg data-board xmlns="http://www.w3.org/2000/svg"><g data-parts></g><path data-stroke fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle data-cursor fill="none" stroke="#5364df" stroke-width="1.5" vector-effect="non-scaling-stroke" pointer-events="none" visibility="hidden"/></svg></div></div>`;
  document.body.append(dialog);dialog.showModal();const $=s=>dialog.querySelector(s),board=$('[data-board]'),group=$('[data-parts]'),ns='http://www.w3.org/2000/svg';let view=[0,0,draft.width,draft.height];
  const selected=()=>draft.parts.find(p=>p.id===id),notice=text=>$('[data-status]').textContent=text;
  function frame(){board.setAttribute('viewBox',view.join(' '));}
  function render(){frame();const select=$('[data-layer]');select.replaceChildren(...draft.parts.map(p=>new Option(partLabel(p),p.id)));select.value=id;
   const i=draft.parts.indexOf(selected()),others=[draft.parts[i-1],draft.parts[i+1]].filter(p=>canMergeLayer(p)&&p.visible===selected()?.visible);$('[data-merge-target]').replaceChildren(...others.map(p=>new Option(partLabel(p),p.id)));$('[data-merge]').disabled=!canMergeLayer(selected())||!others.length;
   $('[data-undo]').disabled=!history.length;$('[data-redo]').disabled=!future.length;
   const valid=new Set(draft.parts.map(p=>p.id));for(const [key,item]of urls)if(!valid.has(key)){URL.revokeObjectURL(item.url);urls.delete(key);}
   group.replaceChildren();for(const p of draft.parts.filter(p=>p.visible)){
    let item=urls.get(p.id);if(!item||item.text!==p.svgText){if(item)URL.revokeObjectURL(item.url);item={text:p.svgText,url:URL.createObjectURL(new Blob([p.svgText],{type:'image/svg+xml'}))};urls.set(p.id,item);}
    const image=document.createElementNS(ns,'image');for(const [key,value]of Object.entries({x:p.x,y:p.y,width:p.width,height:p.height,opacity:(p.opacity??1)*(p.id===id?1:otherOpacity),href:item.url,'data-layer-id':p.id}))image.setAttribute(key,value);group.append(image);
   }
  }
  function change(c){try{const before=draft.parts.map(p=>({...p}));applyLayerEdit(draft,c);history.push(before);if(history.length>30)history.shift();future.length=0;render();notice('補正をプレビューに反映しました。');}catch(e){notice(e.message);}}
  function close(){for(const item of urls.values())URL.revokeObjectURL(item.url);dialog.close();dialog.remove();active=false;api.end();}
  $('[data-cancel]').onclick=close;dialog.oncancel=e=>{e.preventDefault();close();};
  $('[data-apply]').onclick=async()=>{try{if(original!==api.project()||revision!==await layerRevision(original))throw Error('編集中にレイヤーが変更されました。キャンセルして開き直してください');if(revision===await layerRevision(draft)){close();return;}original.parts=draft.parts;await api.changed(id);close();}catch(e){notice(e.message);}};
  $('[data-layer]').onchange=e=>{id=e.target.value;render();};
  for(const b of dialog.querySelectorAll('[data-mode]'))b.onclick=()=>{mode=b.dataset.mode;for(const q of dialog.querySelectorAll('[data-mode]'))q.classList.toggle('active',q===b);};
  $('[data-other-opacity]').oninput=e=>{otherOpacity=+e.target.value/100;$('[data-other-opacity-out]').value=e.target.value+'%';for(const image of group.children){const p=draft.parts.find(p=>p.id===image.dataset.layerId);image.setAttribute('opacity',(p.opacity??1)*(p.id===id?1:otherOpacity));}};
  $('[data-size]').oninput=e=>$('[data-size-out]').value=e.target.value+' px';
  $('[data-undo]').onclick=()=>{if(history.length){future.push(draft.parts);draft.parts=history.pop();if(!selected())id=draft.parts[0].id;render();}};
  $('[data-redo]').onclick=()=>{if(future.length){history.push(draft.parts);draft.parts=future.pop();if(!selected())id=draft.parts[0].id;render();}};
  $('[data-fit]').onclick=()=>{view=[0,0,draft.width,draft.height];frame();};
  $('[data-merge]').onclick=()=>change({operation:'merge',part_id:id,other_id:$('[data-merge-target]').value});
  const point=e=>{const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(board.getScreenCTM().inverse());return [p.x,p.y];};
  function cursor(p){const c=$('[data-cursor]');c.setAttribute('cx',p[0]);c.setAttribute('cy',p[1]);c.setAttribute('r',+$('[data-size]').value/2);c.setAttribute('stroke',mode==='erase'?'#db4764':'#5364df');c.setAttribute('visibility',['paint','erase'].includes(mode)?'visible':'hidden');}
  function ink(){const p=$('[data-stroke]');p.setAttribute('d',stroke.points.map((v,i)=>`${i?'L':'M'}${v[0]} ${v[1]}`).join(' ')+' l.001 0');p.setAttribute('stroke',stroke.mode==='erase'?'#db4764':stroke.color);p.setAttribute('opacity',stroke.mode==='erase'?'.5':'1');p.setAttribute('stroke-width',stroke.size);}
  board.onpointerdown=async e=>{if(e.button!==0&&e.button!==1)return;e.preventDefault();const at=point(e);board.setPointerCapture(e.pointerId);if(mode==='pan'||e.button===1){pan={at,view:[...view]};return;}
   if(mode==='pick'){const p=selected(),item=urls.get(id);if(!item)return;const image=new Image();image.src=item.url;await image.decode();const canvas=document.createElement('canvas');canvas.width=Math.ceil(p.width);canvas.height=Math.ceil(p.height);const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,canvas.width,canvas.height);const [r,g,b,a]=ctx.getImageData(Math.floor(at[0]-p.x),Math.floor(at[1]-p.y),1,1).data;if(a)$('[data-color]').value='#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');else notice('対象レイヤーの色がある部分をクリックしてください');return;}
   stroke={operation:'stroke',part_id:id,mode,color:$('[data-color]').value,size:+$('[data-size]').value,points:[at]};ink();};
  board.onpointermove=e=>{const at=point(e);cursor(at);if(pan){view[0]+=pan.at[0]-at[0];view[1]+=pan.at[1]-at[1];frame();}else if(stroke&&stroke.points.length<10000&&Math.hypot(at[0]-stroke.points.at(-1)[0],at[1]-stroke.points.at(-1)[1])>.5){stroke.points.push(at);ink();}};
  board.onpointerup=e=>{if(stroke){change(stroke);stroke=null;$('[data-stroke]').removeAttribute('d');}pan=null;if(board.hasPointerCapture(e.pointerId))board.releasePointerCapture(e.pointerId);};
  board.onpointercancel=()=>{stroke=null;pan=null;$('[data-stroke]').removeAttribute('d');};board.onpointerleave=()=>{if(!stroke)$('[data-cursor]').setAttribute('visibility','hidden');};
  board.onwheel=e=>{e.preventDefault();const p=point(e),factor=Math.exp(Math.sign(e.deltaY)*.15),width=Math.max(draft.width/16,Math.min(draft.width*2,view[2]*factor)),f=width/view[2];view=[p[0]-(p[0]-view[0])*f,p[1]-(p[1]-view[1])*f,width,view[3]*f];frame();};render();
 }
 return {open,get active(){return active;}};
}
