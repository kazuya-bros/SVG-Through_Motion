export function installRenderSourceUI({project,selected,changed}){
 const global=document.getElementById('renderSource');
 global.options[0].textContent='元PNGを優先（未編集の固定パーツ）';global.options[1].textContent='すべてSVGから描画';
 global.closest('details').querySelector('p').textContent='元絵の見た目を保つには「元PNGを優先」を選びます。目・口などや線・塗りを編集したパーツはSVGを使います。動画の解像度は、どちらを選んでも同じです。';
 const label=document.createElement('label');label.textContent='このパーツの描画';const select=document.createElement('select');select.id='partRenderSource';
 for(const [value,text] of [['','全体の設定に従う'],['svg','SVG（編集した線・塗り）'],['original','元PNG（未編集の固定パーツのみ）']])select.append(new Option(text,value));
 const note=document.createElement('p');note.className='tiny';note.hidden=true;label.hidden=true;label.append(select);document.getElementById('partFields').append(label,note);
 function refresh(){const p=project()?.parts.find(p=>p.id===selected());if(!p)return;select.value=p.renderSource||'';select.options[2].disabled=p.role!=='static'||p.rasterDisabled||!p.rasterSourceUrl;note.textContent='SVGは線と塗りを直接編集できます。PNGを選んでも、形を編集したパーツにはSVGを使います。';}
 select.onchange=()=>{const p=project()?.parts.find(p=>p.id===selected());if(!p)return;p.renderSource=select.value;changed();refresh();};
 return {refresh};
}
