const storageKey='svg-through.saved-characters.v1';
const savedId=url=>String(url).match(/^\/api\/exports\/([a-f0-9]{32})\/(?:svg-through|khaula)-motion\.project\.json$/)?.[1];
function readSaved(){
 try{return JSON.parse(localStorage.getItem(storageKey)||'[]').filter(p=>p&&savedId(p.url)&&typeof p.name==='string').slice(0,20);}catch{return [];}
}
export function rememberCharacter(saved,name,metadata={}){
 if(!savedId(saved.url))return;
 const previous=readSaved().find(p=>p.url===saved.url)||{};
 const item={...previous,url:saved.url,name:String(name||'キャラクター').slice(0,150)};
 if(metadata.savedAt)item.savedAt=metadata.savedAt;
 if(metadata.thumbnail?.startsWith('data:image/'))item.thumbnail=metadata.thumbnail;
 try{localStorage.setItem(storageKey,JSON.stringify([item,...readSaved().filter(p=>p.url!==item.url)].slice(0,20)));}catch{/* The return URL also carries the saved file when browser storage is unavailable. */}
}
export function returnToMenu(saved){
 const id=saved&&savedId(saved.url);
 location.assign(id?'/?saved='+id:'/');
}
export function installMainMenu({openFile}){
 const effects=document.createElement('button');effects.id='startEffects';effects.type='button';effects.innerHTML='<svg viewBox="0 0 32 32" aria-hidden="true"><path d="m16 3 3.5 9.5L29 16l-9.5 3.5L16 29l-3.5-9.5L3 16l9.5-3.5Z"/></svg><span>演出を<br>作る</span>';document.getElementById('startUse').before(effects);
 effects.onclick=()=>location.assign('/?menu=effects');
 const prepare=document.createElement('a');prepare.href='/web/materials.html';prepare.className='material-entry-link';prepare.textContent='パーツを準備・補正する';prepare.style.cssText='display:inline-block;margin:12px 0;padding:12px 20px;border:1px solid #cbd5e7;border-radius:10px;color:#415ba5;background:white;text-decoration:none;font-weight:600';document.getElementById('startOwn')?.parentElement.after(prepare);
 const $=id=>document.getElementById(id),query=new URLSearchParams(location.search);
 const choices=readSaved(),id=query.get('saved');
 if(/^[a-f0-9]{32}$/.test(id||'')&&!choices.some(p=>savedId(p.url)===id))choices.unshift({url:`/api/exports/${id}/svg-through-motion.project.json`,name:'保存したキャラクター'});
 const label=p=>p.name+' — '+(p.savedAt?new Date(p.savedAt).toLocaleString('ja-JP'):'保存日時不明');
 function picker(selectId,imageId,infoId,buttonId){
  const select=$(selectId),image=$(imageId),info=$(infoId),button=$(buttonId);if(!select)return;
  select.replaceChildren(...(choices.length?choices.map(p=>new Option(label(p),p.url)):[new Option('このブラウザの保存履歴はありません','')]));
  button.disabled=!choices.length;let version=0;
  select.onchange=async()=>{
   const p=choices.find(p=>p.url===select.value),ticket=++version;image.hidden=true;info.textContent=p?.savedAt?'保存日時：'+new Date(p.savedAt).toLocaleString('ja-JP'):'保存したプロジェクトファイルからも再開できます。';
   if(!p)return;
   if(p.thumbnail?.startsWith('data:image/')){image.src=p.thumbnail;image.hidden=false;return;}
   try{const r=await fetch(p.url);if(!r.ok)throw Error('保存ファイルが見つかりません。プロジェクトファイルから開いてください。');const data=await r.json();if(ticket!==version)return;
    p.name=data.name||p.name;p.savedAt=data.savedAt||p.savedAt;select.selectedOptions[0].textContent=label(p);
    // Older saves have no thumbnail; use the source image for identification.
    if(typeof data.sourceUrl==='string'&&(data.sourceUrl.startsWith('data:image/')||data.sourceUrl.startsWith('/api/'))){image.src=data.sourceUrl;image.hidden=false;}
    info.textContent=p.savedAt?'保存日時：'+new Date(p.savedAt).toLocaleString('ja-JP'):'以前に保存したプロジェクト（日時の記録なし）';
   }catch(e){if(ticket===version)info.textContent=e.message;}
  };
  void select.onchange();
 }
 picker('resumeSaved','resumeThumbnail','resumeSavedInfo','resumeSavedOpen');
 $('resumeSavedOpen').onclick=()=>{const id=savedId($('resumeSaved').value);if(id)location.assign('/?project='+id);};
 const banner=$('saveReceipt');
 if(banner){
  banner.hidden=!(/^[a-f0-9]{32}$/.test(id||'')&&!query.has('menu')&&location.hash!=='#materials');
  $('dismissSaveReceipt').onclick=()=>{banner.hidden=true;};
  $('startLanding').addEventListener('click',event=>{
   if(event.target.closest('#startOwn,#startSample,#startResume,#startUse'))banner.hidden=true;
  });
 }
 $('startUse').onclick=()=>location.assign('/?menu=use'+(query.has('saved')?'&saved='+encodeURIComponent(query.get('saved')):''));
 $('startUse').disabled=false;
 if(!['project','prepared','runtime'].some(k=>/^[a-f0-9]{32}$/.test(query.get(k)||'')))document.documentElement.classList.remove('route-loading');
 const effectEditor=query.get('menu')==='effects';
 if(!effectEditor&&query.get('menu')!=='use')return;
 $('startLanding').hidden=true;$('startSourceHost').hidden=true;$('startUseHost').hidden=false;
 if(effectEditor){$('startUseHost').querySelector('h1').textContent='演出を作るキャラクターを選ぶ';$('startUseHost').querySelector('h1 + p').textContent='保存したキャラクターを選んで、演出を作成・保存します。';$('useSavedCharacter').textContent='このキャラクターで演出を作る';}
 picker('savedCharacter','savedCharacterThumbnail','savedCharacterInfo','useSavedCharacter');
 $('savedCharacterChoices').hidden=!choices.length;$('noSavedCharacter').hidden=!!choices.length;
 $('useSavedCharacter').disabled=!choices.length;
 let opening=false;
 async function openCharacter(load){
  if(opening)return;opening=true;const message=$('useProjectStatus');message.textContent='キャラクターを読み込んでいます…';
  $('useSavedCharacter').disabled=$('savedCharacter').disabled=$('useProjectFile').disabled=true;
  try{await openFile(await load(),{effects:effectEditor});message.textContent='';}
  catch(error){message.textContent='読み込めませんでした：'+error.message;}
  finally{opening=false;$('useSavedCharacter').disabled=!choices.length;$('savedCharacter').disabled=$('useProjectFile').disabled=false;}
 }
 $('useSavedCharacter').onclick=()=>openCharacter(async()=>{const response=await fetch($('savedCharacter').value);if(!response.ok)throw Error('保存ファイルが見つかりません。プロジェクトファイルから開いてください。');return response.json();});
 $('useProjectFile').onchange=async e=>{
  const file=e.target.files[0];if(!file)return;
  await openCharacter(async()=>{if(file.size>100*1024**2)throw Error('プロジェクトは100MB以下にしてください');return JSON.parse(await file.text());});
  e.target.value='';
 };
}
