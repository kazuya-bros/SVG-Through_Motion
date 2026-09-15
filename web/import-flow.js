import {installImportWizard} from './import-wizard.js';
const donorKeys=['eyes_closed','mouth_closed','mouth_a','mouth_i','mouth_u','mouth_e','mouth_o'];
export function selectDonorFiles(choice,files){
 if(choice.mode!=='donors')return {};
 const out={},need=(key,label)=>{if(!files[key])throw Error(label+'のPSDを選んでください');return files[key];};
 if(choice.eyes==='psd')out.eyes_closed=need('eyes_closed','閉じ目');
 if(choice.mouth==='psd')out.mouth_closed=need('mouth_closed','閉じ口');
 if(choice.mouth==='same'){
  if(!out.eyes_closed)throw Error('閉じ口にも使う閉じ目のPSDを選んでください');
  out.mouth_closed=out.eyes_closed;
 }
 // Vowel files remain supported by the legacy API, but are not sent by this UI.
 return out;
}
export function installImportFlow(){
 const $=id=>document.getElementById(id);
 const choice=()=>({mode:document.querySelector('[name=importMode]:checked').value,eyes:$('eyeSource').value,mouth:$('mouthSource').value});
 function refresh(){
  const c=choice(),extra=c.mode==='donors';
  $('faceDonorOptions').hidden=!extra;
  document.querySelectorAll('[name=importMode]').forEach(input=>input.closest('label').classList.toggle('active',input.checked));
  for(const key of donorKeys){const input=$('donor-'+key),on=extra&&(key==='eyes_closed'?c.eyes==='psd':key==='mouth_closed'?c.mouth==='psd':false);input.disabled=!on;input.required=on&&['eyes_closed','mouth_closed'].includes(key);if(key==='eyes_closed'||key==='mouth_closed')input.closest('.donor-file').hidden=!on;}
  $('eyeSource').disabled=$('mouthSource').disabled=!extra;
  $('importMethodHint').textContent=extra?'次に、元絵・基本のPSDと、使いたい差分PSDを選びます。':'元絵と、その絵を分割したPSDで始められます。Depth PSDも任意で追加できます。';
  $('importResultHint').textContent=extra?`読み込み後：目は${c.eyes==='psd'?'開閉を確認':'下書きを調整'}、口は${c.mouth!=='auto'?'開閉を確認':'下書きを調整'}。`:'読み込み後：目 → 口の順に閉じ形を整えます。素材が気になるときは「パーツの絵を確認」で比較できます。';
 }
 document.querySelectorAll('[name=importMode],#eyeSource,#mouthSource').forEach(input=>input.addEventListener('change',refresh));
 for(const button of document.querySelectorAll('[data-clear-donor]'))button.onclick=()=>{$('donor-'+button.dataset.clearDonor).value='';};
 $('clearDepth').onclick=()=>{$('hybridDepth').value='';};
 refresh();
 installImportWizard();
 return {files(){return selectDonorFiles(choice(),Object.fromEntries(donorKeys.map(k=>[k,$('donor-'+k).files[0]])));},refresh};
}
