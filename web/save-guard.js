// Compare editable state on departure; preview-only operations do not require saving.
export function installSaveGuard({state,save,enabled,navigate=url=>location.assign(url)}){
 let baseline='',unsaved=false,touched=false,leaving=false,busy=false;
 const dialog=document.createElement('dialog');dialog.id='saveBeforeMenu';dialog.className='save-menu-dialog';
 dialog.setAttribute('aria-labelledby','saveBeforeMenuTitle');
 dialog.innerHTML='<h2 id="saveBeforeMenuTitle">変更を保存して戻りますか？</h2><p>目・口の編集や動きの調整を、続きから再開できるように保存します。</p><div class="save-menu-actions"><button id="saveAndMenu" class="primary">保存して戻る</button><button id="discardAndMenu">変更を破棄して戻る</button><button id="keepEditing">編集を続ける</button></div><p id="saveMenuError" role="status" hidden></p>';
 document.body.append(dialog);
 const dirty=()=>!leaving&&enabled()&&(unsaved||(touched&&state()!==baseline));
 const touch=e=>{if(e.isTrusted&&e.target.closest('#editingWorkspace')&&enabled())touched=true;};
 for(const name of ['input','change','click','pointerup'])document.addEventListener(name,touch);
 document.querySelector('.brand').addEventListener('click',e=>{if(e.button||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;if(dirty()){e.preventDefault();dialog.showModal();}});
 dialog.querySelector('#keepEditing').onclick=()=>dialog.close();
 dialog.querySelector('#discardAndMenu').onclick=()=>{leaving=true;navigate('/');};
 dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
 dialog.querySelector('#saveAndMenu').onclick=async()=>{
  if(busy)return;busy=true;dialog.querySelectorAll('button').forEach(b=>b.disabled=true);
  const message=dialog.querySelector('#saveMenuError');message.hidden=false;message.textContent='保存しています…';
  try{const result=await save();leaving=true;navigate('/?saved='+result.url.split('/')[3]);}
  catch(e){message.textContent='保存できませんでした。編集内容は残っています。'+e.message;}
  finally{busy=false;dialog.querySelectorAll('button').forEach(b=>b.disabled=false);}
 };
 window.addEventListener('beforeunload',e=>{if(dirty()){e.preventDefault();e.returnValue='';}});
 return {reset(saved=false){baseline=state();unsaved=!saved;touched=false;leaving=false;},saved(value=state()){baseline=value;unsaved=false;touched=true;},touch(){touched=true;},dirty};
}
