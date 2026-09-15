export function installRenderSourceUI({project,selected,changed}){
 const global=document.getElementById('renderSource');
 global.options[0].textContent='未編集の固定パーツは元PNGで描画';global.options[1].textContent='すべてSVGで描画（線・塗りの編集を反映）';
 global.closest('details').querySelector('p').textContent='新しく補正した素材はSVGで描画します。元PNGは、線の変換で塗りが崩れたときに固定パーツだけで選べます。';
 const label=document.createElement('label');label.textContent='このパーツの描画';const select=document.createElement('select');select.id='partRenderSource';
 for(const [value,text] of [['','全体の設定に従う'],['svg','SVG（編集した線・塗り）'],['original','元PNG（未編集の固定パーツのみ）']])select.append(new Option(text,value));
 const note=document.createElement('p');note.className='tiny';label.append(select);document.getElementById('partFields').append(label,note);
 function refresh(){const p=project()?.parts.find(p=>p.id===selected());if(!p)return;select.value=p.renderSource||'';select.options[2].disabled=p.role!=='static'||p.rasterDisabled||!p.rasterSourceUrl;note.textContent='SVGは線と塗りを直接編集できます。PNGを選んでも、形を編集したパーツにはSVGを使います。';}
 select.onchange=()=>{const p=project()?.parts.find(p=>p.id===selected());if(!p)return;p.renderSource=select.value;changed();refresh();};
 return {refresh};
}
