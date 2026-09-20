// Brush drafts stay local until extraction is confirmed. The API owns the pixel cut.
export function brushSteps(from,to,radius){
 const count=Math.max(1,Math.ceil(Math.hypot(to[0]-from[0],to[1]-from[1])/Math.max(1,radius*.2)));
 return Array.from({length:count},(_,i)=>{const t=(i+1)/count;return [from[0]+(to[0]-from[0])*t,from[1]+(to[1]-from[1])*t];});
}
export function installMaterialBrush(api){
 const dialog=document.createElement('dialog');dialog.className='material-brush-dialog';dialog.setAttribute('aria-labelledby','brushTitle');
 dialog.innerHTML=`<header><div><span class="eyebrow">素材補正 / レイヤー切り出し</span><h2 id="brushTitle">ブラシで切り出す</h2><p id="brushSource"></p></div><button id="brushClose" type="button" aria-label="切り出しをキャンセル">閉じる</button></header>
 <ol class="brush-steps"><li>① 元レイヤーを確認</li><li>② 残したい部分を塗る</li><li>③ 確認して切り出す</li></ol>
 <div class="brush-layout"><section class="brush-work"><div class="brush-toolbar"><button type="button" id="brushPaint" aria-pressed="true">ブラシで塗る</button><button type="button" id="brushErase" aria-pressed="false">塗りを消す</button><button type="button" id="brushUndo">一筆戻す</button><button type="button" id="brushClear">塗りをクリア</button></div>
 <div class="brush-settings"><label>ブラシサイズ <output id="brushSizeOut">40 px</output><input id="brushSize" aria-label="切り出しブラシのサイズ" type="range" min="1" max="200" value="40"></label><label>境界のぼかし <output id="brushSoftOut">0%</output><input id="brushSoft" aria-label="切り出し境界のぼかし" type="range" min="0" max="1" step=".05" value="0"></label></div>
 <p class="tiny">赤い範囲だけが新しいレイヤーになります。消しブラシは選択範囲だけを消します。</p>
 <div class="brush-surface"><canvas id="brushCanvas" aria-label="切り出す部分をブラシで塗るキャンバス"></canvas><i id="brushCursor" hidden></i></div></section>
 <aside class="brush-result"><h3>切り出し結果のプレビュー</h3><div class="brush-result-image"><canvas id="brushPreview" aria-label="新しいレイヤーのプレビュー"></canvas></div><p id="brushPreviewStatus" class="tiny" role="status">元レイヤーの絵がある部分を塗ってください。</p><label>新しいレイヤー名<input id="brushName" maxlength="150"></label><label class="check"><input id="brushCut" type="checkbox" checked>元レイヤーから切り取る</label><p class="tiny" id="brushCutHint">塗った部分を元レイヤーから分離します。切り出したレイヤーは元の動きに追従します。</p><p class="tiny">確定後も「元に戻す」で戻せます。</p><p id="brushError" role="alert"></p><button class="primary" type="button" id="brushCommit" disabled>別レイヤーに切り出す</button><button type="button" id="brushCancel">キャンセル</button></aside></div>`;
 document.body.append(dialog);const $=id=>dialog.querySelector('#'+id);
 const canvas=$('brushCanvas'),ctx=canvas.getContext('2d'),mask=document.createElement('canvas'),mctx=mask.getContext('2d'),tint=document.createElement('canvas'),tctx=tint.getContext('2d'),result=$('brushPreview'),rctx=result.getContext('2d');
 let source=null,strokes=[],stroke=null,tool='paint',busy=false,hasPixels=false,committed=false;
 const diameter=()=>+$('brushSize').value;
 function stamp(point,s){
  const r=s.size/2;mctx.save();mctx.globalCompositeOperation=s.tool==='erase'?'destination-out':'source-over';
  let fill='#fff';if(s.soft>0){fill=mctx.createRadialGradient(...point,r*(1-s.soft),...point,r);fill.addColorStop(0,'#fff');fill.addColorStop(1,'#ffffff00');}
  mctx.fillStyle=fill;mctx.beginPath();mctx.arc(...point,r,0,Math.PI*2);mctx.fill();mctx.restore();
 }
 function replay(){mctx.clearRect(0,0,mask.width,mask.height);for(const s of strokes){stamp(s.points[0],s);for(let i=1;i<s.points.length;i++)for(const p of brushSteps(s.points[i-1],s.points[i],s.size/2))stamp(p,s);}draw(true);}
 function controls(){for(const id of ['brushClose','brushPaint','brushErase','brushSize','brushSoft','brushName','brushCut','brushCancel'])$(id).disabled=busy;$('brushUndo').disabled=$('brushClear').disabled=busy||!strokes.length;$('brushCommit').disabled=busy||committed||!hasPixels;$('brushCommit').textContent=busy?'切り出しています…':'別レイヤーに切り出す';}
 function draw(check=false){
  if(!source)return;
  ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(source.image,0,0,canvas.width,canvas.height);
  tctx.clearRect(0,0,tint.width,tint.height);tctx.drawImage(mask,0,0,tint.width,tint.height);tctx.globalCompositeOperation='source-in';tctx.fillStyle='#ef4666';tctx.fillRect(0,0,tint.width,tint.height);tctx.globalCompositeOperation='source-over';ctx.globalAlpha=.5;ctx.drawImage(tint,0,0);ctx.globalAlpha=1;
  rctx.clearRect(0,0,result.width,result.height);rctx.drawImage(source.image,0,0,result.width,result.height);rctx.globalCompositeOperation='destination-in';rctx.drawImage(mask,0,0,result.width,result.height);rctx.globalCompositeOperation='source-over';
  if(check){const pixels=rctx.getImageData(0,0,result.width,result.height).data;hasPixels=false;for(let i=3;i<pixels.length;i+=4)if(pixels[i]){hasPixels=true;break;}$('brushPreviewStatus').textContent=hasPixels?'この部分が、元と同じ位置に新しいレイヤーとして追加されます。':'元レイヤーの絵がある部分を塗ってください。';controls();}
 }
 function point(e){const r=canvas.getBoundingClientRect();return [Math.max(0,Math.min(mask.width,(e.clientX-r.left)/r.width*mask.width)),Math.max(0,Math.min(mask.height,(e.clientY-r.top)/r.height*mask.height))];}
 function cursor(e){const r=canvas.getBoundingClientRect(),parent=canvas.parentElement.getBoundingClientRect(),d=diameter()*r.width/mask.width;Object.assign($('brushCursor').style,{left:e.clientX-parent.left+'px',top:e.clientY-parent.top+'px',width:d+'px',height:d+'px'});$('brushCursor').hidden=false;}
 canvas.onpointerdown=e=>{if(busy||e.button!==0)return;e.preventDefault();canvas.setPointerCapture(e.pointerId);stroke={tool,size:diameter(),soft:+$('brushSoft').value,points:[point(e)],pointer:e.pointerId};strokes.push(stroke);stamp(stroke.points[0],stroke);cursor(e);draw();};
 canvas.onpointermove=e=>{if(!source||busy)return;cursor(e);if(!stroke||stroke.pointer!==e.pointerId)return;e.preventDefault();const p=point(e),last=stroke.points.at(-1);for(const v of brushSteps(last,p,stroke.size/2))stamp(v,stroke);stroke.points.push(p);draw();};
 const finishStroke=e=>{if(!stroke||stroke.pointer!==e.pointerId)return;stroke=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);draw(true);};
 canvas.onpointerup=canvas.onpointercancel=finishStroke;canvas.onlostpointercapture=()=>{stroke=null;draw(true);};canvas.onpointerleave=()=>{$('brushCursor').hidden=true;};
 for(const [id,value]of [['brushPaint','paint'],['brushErase','erase']])$(id).onclick=()=>{tool=value;$('brushPaint').setAttribute('aria-pressed',String(tool==='paint'));$('brushErase').setAttribute('aria-pressed',String(tool==='erase'));};
 $('brushSize').oninput=()=>{$('brushSizeOut').value=diameter()+' px';};$('brushSoft').oninput=()=>{$('brushSoftOut').value=Math.round(+$('brushSoft').value*100)+'%';};
 $('brushUndo').onclick=()=>{strokes.pop();replay();};$('brushClear').onclick=()=>{strokes=[];replay();};
 $('brushCut').onchange=()=>{$('brushCutHint').textContent=$('brushCut').checked?'塗った部分を元レイヤーから分離します。切り出したレイヤーは元の動きに追従します。':'元レイヤーを残して、塗った部分を複製します。重ねると半透明の部分が濃くなる場合があります。';};
 function close(){if(busy)return;dialog.close();source=null;strokes=[];stroke=null;}
 $('brushClose').onclick=$('brushCancel').onclick=close;dialog.oncancel=e=>{e.preventDefault();close();};
 $('brushCommit').onclick=async()=>{
  if(busy||committed||!source||!hasPixels)return;busy=true;controls();$('brushError').textContent='';
  try{
   await api.save();
   const current=api.state(),p=current.layers.find(v=>v.id===source.part.id);
   if(current.id!==source.materialId||!p||p.asset!==source.part.asset||p.locked)throw Error('元レイヤーが変更されました。閉じて選び直してください。');
   const before=new Set(current.layers.map(v=>v.id));
   const updated=await api.request('/api/materials/'+current.id+'/extract',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:current.revision,part_id:p.id,rect:[0,0,mask.width,mask.height],mask_png:mask.toDataURL('image/png'),cut_source:$('brushCut').checked,name:$('brushName').value.trim()||p.name+'の切り出し'})});
   committed=true;api.checkpoint();await api.adopt(updated);const added=updated.layers.find(v=>!before.has(v.id));if(added)api.select(added.id);
   api.message('「'+(added?.name||'新しいレイヤー')+'」を追加しました。元の位置と追従先を引き継いでいます。');busy=false;close();
  }catch(e){$('brushError').textContent=(committed?'切り出しは保存済みですが、表示を更新できませんでした。閉じて素材を開き直してください。 ':'')+e.message;}finally{busy=false;controls();}
 };
 return {start(part,image){
  if(!part||part.locked||!image)return;
  // Crop is part of the source artwork, not a second selection mask.
  const sourceImage=document.createElement('canvas');sourceImage.width=image.width;sourceImage.height=image.height;const sctx=sourceImage.getContext('2d');
  if(part.crop){sctx.beginPath();sctx.rect(part.crop[0],part.crop[1],part.crop[2]-part.crop[0],part.crop[3]-part.crop[1]);sctx.clip();}sctx.drawImage(image,0,0);
  source={part:structuredClone(part),materialId:api.state().id,image:sourceImage};strokes=[];stroke=null;busy=false;hasPixels=false;committed=false;tool='paint';
  mask.width=image.width;mask.height=image.height;const scale=Math.min(1,1000/Math.max(image.width,image.height));canvas.width=tint.width=Math.max(1,Math.round(image.width*scale));canvas.height=tint.height=Math.max(1,Math.round(image.height*scale));const rs=Math.min(1,360/Math.max(image.width,image.height));result.width=Math.max(1,Math.round(image.width*rs));result.height=Math.max(1,Math.round(image.height*rs));
  $('brushSource').textContent='切り出し元：'+part.name+'（選択したレイヤーだけを表示）';$('brushName').value=(part.name+'の切り出し').slice(0,150);$('brushError').textContent='';$('brushPaint').setAttribute('aria-pressed','true');$('brushErase').setAttribute('aria-pressed','false');$('brushCursor').hidden=true;$('brushCut').checked=true;$('brushCut').onchange();
  dialog.showModal();draw(true);
 },get active(){return !!source;}};
}
