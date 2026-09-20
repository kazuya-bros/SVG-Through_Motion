import {validateTrack,sampleTrack,pathData,demoTrack,retimeEyeTrack} from './svg-keyframes.js';
const $=id=>document.getElementById(id),tracks={eye:demoTrack('eye'),mouth:demoTrack('mouth')};
const rifeData=JSON.parse($('rifeData')?.textContent||'null');
let source=rifeData?'rife':'manual';
let timingStrength=1;
if(rifeData)for(const key of ['eye','mouth'])tracks[key]=validateTrack(rifeData.cases[key].track);
if(rifeData)tracks.eye=retimeEyeTrack(tracks.eye,timingStrength);
let kind='eye',selected=.5,t=.5,playing=false,started=0,raf=0;
const track=()=>tracks[kind];
function artwork(d,id,animation=''){
  return kind==='eye'?`<defs><clipPath id="${id}"><path data-morph="" d="${d}">${animation}</path></clipPath></defs><path data-morph="" d="${d}" fill="#fffdf8">${animation}</path><g clip-path="url(#${id})"><ellipse cx="123" cy="109" rx="28" ry="39" fill="#cb894b"/><ellipse cx="124" cy="110" rx="12" ry="28" fill="#503c37"/><ellipse cx="112" cy="89" rx="8" ry="10" fill="white"/></g><path data-morph="" d="${d}" fill="none" stroke="#3e343a" stroke-width="4" stroke-linejoin="round">${animation}</path>`:
    `<defs><clipPath id="${id}"><path data-morph="" d="${d}">${animation}</path></clipPath></defs><path data-morph="" d="${d}" fill="#783d4c">${animation}</path><g clip-path="url(#${id})"><path d="M30 72H210V109Q120 119 30 109Z" fill="#fff7ed"/><ellipse cx="125" cy="171" rx="47" ry="30" fill="#d98d97"/></g><path data-morph="" d="${d}" fill="none" stroke="#59363f" stroke-width="3" stroke-linejoin="round">${animation}</path>`;
}
function svg(points,id,guides=false,animation=''){
  const d=pathData(track().commands,points);
  const dots=guides?points.reduce((s,n,i)=>i%2?s:s+`<circle data-control="${i}" cx="${n}" cy="${points[i+1]}" r="2.7" fill="#4b6be5" stroke="white" stroke-width="1"/>`,''):'';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 220" role="img" aria-label="${kind==='eye'?'目':'口'}の形"><rect x="7" y="12" width="226" height="195" rx="55" fill="#f7e7dd"/>${artwork(d,id,animation)}${dots}</svg>`;
}
function draw(){
  const sample=sampleTrack(track(),t),comparingTiming=source==='rife'&&kind==='eye';
  const plain=comparingTiming?sampleTrack(rifeData.cases.eye.track,t):sampleTrack(track(),t,{endpointsOnly:true});
  for(const [id,points] of [['baseline',plain.points],['corrected',sample.points]]){
    const host=$(id),key=kind+':'+$('guides').checked;
    if(host.dataset.shape!==key){host.innerHTML=svg(points,id,$('guides').checked);host.dataset.shape=key;}
    else{
      const d=pathData(track().commands,points);
      for(const path of host.querySelectorAll('[data-morph]'))path.setAttribute('d',d);
      for(const dot of host.querySelectorAll('[data-control]')){const i=Number(dot.dataset.control);dot.setAttribute('cx',points[i]);dot.setAttribute('cy',points[i+1]);}
    }
  }
  $('interval').textContent=`${sample.from} → ${sample.to} の区間を ${Math.round(sample.ratio*100)}％ 変形`;
  $('scrub').value=t;$('value').textContent=`開閉値 ${t.toFixed(3)}`;
}
function editor(){
  $('thumbs').innerHTML=track().frames.map(f=>`<button class="thumb ${f.at===selected?'active':''}" data-at="${f.at}" aria-label="${f.at}の形を選択" aria-pressed="${f.at===selected}">${svg(f.points,'thumb'+String(f.at).replace('.',''))}<span>${f.at}${f.at===0||f.at===1?' · 固定':''}</span></button>`).join('');
  const f=track().frames.find(f=>f.at===selected),p=f.points,locked=selected===0||selected===1;
  for(const [id,value] of [['upper',p[3]],['lower',p[9]],['width',(p[6]-p[0])/2]]){$(id).value=value;$(id).disabled=locked;$(id+'Value').textContent=String(Math.round(value));}
  $('stats').textContent=`形状データ ${(new TextEncoder().encode(JSON.stringify(track())).length/1024).toFixed(2)} KB ／ 輪郭 ${track().frames[0].points.length/2}点 × ${track().frames.length}段階 ／ 再生時のAI推論なし`;
  const comparingTiming=source==='rife'&&kind==='eye';
  $('timingControls').hidden=!comparingTiming;
  $('timing').value=timingStrength*100;$('timingValue').textContent=Math.round(timingStrength*100)+'%';
  $('baselineLabel').textContent=comparingTiming?'補正前のRIFE形状':'0 → 1 だけ';
  $('baselineNote').textContent=comparingTiming?'RIFE由来のSVGを、そのままの開閉配分で再生':'両端の形から、そのまま変形';
  $('targetLabel').textContent=comparingTiming?'閉じるタイミングを補正':source==='rife'?'RIFEを参考にしたSVG':'中間の形を通る';
  $('sourceNote').textContent=source==='rife'?'生成済みのRIFE画像から輪郭を推定し、閉じ戻りを抑える補正を加えています。再生中はSVGだけで動きます。':source==='imported'?'読み込んだ形状データを再生しています。下のRIFE参考画像とは異なる形状の場合があります。':'中間形状は手作りです。RIFE由来の形状ではありません。';
  if(rifeData){
    $('rifeReferences').innerHTML=rifeData.cases[kind].references.map((url,i)=>`<div class="thumb"><img src="${url}" alt="${i/4}のRIFE参考画像" style="width:100%;display:block"><span>${i/4}${i===0||i===4?' · 入力':' · RIFE'}</span></div>`).join('');
    const corrections=rifeData.cases[kind].metrics.filter(m=>m.at>0&&m.at<1),max=Math.max(...corrections.map(m=>m.maxStabilizationPx));
    $('fitNote').textContent=`生成時の安定化補正：最大 ${max.toFixed(1)}px。RIFEには薄れ・二重線が生じる場合があります。特に口の途中の形は、元画像と見比べて調整してください。`;
  }
}
function stop(){playing=false;cancelAnimationFrame(raf);$('play').textContent='自動で往復';}
function tick(now){if(!playing)return;const phase=((now-started)/(Number($('duration').value)*1000))%1;t=(1-Math.cos(phase*Math.PI*2))/2;draw();raf=requestAnimationFrame(tick);}
function seek(value){if(!Number.isFinite(value))throw Error('開閉値は数値で指定してください。');stop();t=Math.max(0,Math.min(1,value));draw();}
function message(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
function save(name,type,text){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);message(name+' を保存しました。');}
$('play').onclick=()=>{if(playing){stop();return;}playing=true;started=performance.now()-Math.acos(1-2*t)/(Math.PI*2)*Number($('duration').value)*1000;$('play').textContent='一時停止';raf=requestAnimationFrame(tick);};
$('duration').onchange=()=>{if(playing)started=performance.now()-Math.acos(1-2*t)/(Math.PI*2)*Number($('duration').value)*1000;};
$('scrub').oninput=e=>seek(Number(e.target.value));$('guides').onchange=draw;
$('kind').onchange=e=>{stop();kind=e.target.value;selected=.5;t=.5;editor();draw();message('');};
$('thumbs').onclick=e=>{const button=e.target.closest('[data-at]');if(!button)return;selected=Number(button.dataset.at);seek(selected);editor();};
for(const id of ['upper','lower','width'])$(id).oninput=()=>{
  const f=track().frames.find(f=>f.at===selected);if(selected===0||selected===1)return;
  const p=f.points,upper=Number($('upper').value),lower=Number($('lower').value),w=Number($('width').value);
  const lowerHandle=kind==='eye'?.62:.75;
  p[0]=p[12]=120-w;p[6]=120+w;p[2]=120-w*.62;p[4]=120+w*.62;p[8]=120+w*lowerHandle;p[10]=120-w*lowerHandle;p[3]=p[5]=upper;p[9]=p[11]=lower;
  seek(selected);editor();
};
$('reset').onclick=()=>{stop();if(source==='imported'){source='manual';$('source').value=source;}tracks[kind]=source==='rife'?(kind==='eye'?retimeEyeTrack(rifeData.cases.eye.track,timingStrength):validateTrack(rifeData.cases[kind].track)):demoTrack(kind);selected=.5;t=.5;editor();draw();message('初期形状に戻しました。');};
$('saveJson').onclick=()=>save(`svg-morph-${kind}.json`,'application/json',JSON.stringify({kind,track:track()},null,2));
$('importFile').onchange=async e=>{
  try{const file=e.target.files?.[0];if(!file)return;if(file.size>100000)throw Error('形状データは100KB以下にしてください。');
    const data=JSON.parse(await file.text()),next=validateTrack(data.track);
    if(!['eye','mouth'].includes(data.kind)||next.commands.join()!=='M,C,C,Z'||next.frames.map(f=>f.at).join()!=='0,0.25,0.5,0.75,1')throw Error('この試作の目・口の5段階データを選んでください。');
    stop();kind=data.kind;source='imported';$('source').value=source;tracks[kind]=next;$('kind').value=kind;selected=.5;t=.5;editor();draw();message('形状データを読み込みました。');
  }catch(error){message(error.message,true);}finally{e.target.value='';}
};
function animatedSvg(){
  const forward=track().frames,frames=[...forward,...forward.slice(0,-1).reverse()];
  const values=frames.map(f=>pathData(track().commands,f.points)).join(';'),times=frames.map((_,i)=>i/8).join(';');
  const animation=`<animate attributeName="d" dur="${Number($('duration').value)}s" repeatCount="indefinite" calcMode="linear" keyTimes="${times}" values="${values}"/>`;
  return svg(forward[0].points,'export',false,animation);
}
$('saveSvg').onclick=()=>save(`svg-morph-${kind}.svg`,'image/svg+xml',animatedSvg());
// Small, synchronous prototype API: same track sampling as the visible controls.
function setSource(next){
  if(!['manual','rife'].includes(next)||next==='rife'&&!rifeData)throw Error('RIFEの生成データがありません。');
  stop();source=next;
  for(const key of ['eye','mouth'])tracks[key]=source==='rife'?validateTrack(rifeData.cases[key].track):demoTrack(key);
  if(source==='rife')tracks.eye=retimeEyeTrack(tracks.eye,timingStrength);
  $('source').value=source;selected=.5;t=.5;editor();draw();message('方式を切り替え、初期形状を読み込みました。');
}
$('source').onchange=e=>setSource(e.target.value);
function setTimingStrength(value){
  if(!rifeData||source!=='rife'||!Number.isFinite(value)||value<0||value>1)throw Error('RIFE方式で、補正の強さを0〜1で指定してください。');
  stop();timingStrength=value;tracks.eye=retimeEyeTrack(rifeData.cases.eye.track,value);editor();draw();
}
$('timing').oninput=e=>setTimingStrength(Number(e.target.value)/100);
if(rifeData){
  $('sourceControls').hidden=false;$('referencePanel').hidden=false;
  $('scopeNote').textContent='実際のRIFE推論と、このサンプル専用の輪郭フィットを接続しています。任意のキャラクター素材の読み込み・本体への適用は未接続です。保存するアニメSVGには画像を含みません。';
}
window.svgMorphPrototype={getState:()=>({kind,source,timingStrength,value:t,track:structuredClone(track()),sample:sampleTrack(track(),t)}),setValue:seek,setSource,setTimingStrength,exportSvg:animatedSvg};
editor();draw();
