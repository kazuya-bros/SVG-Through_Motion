export function chooseProjectSave(name){
 return new Promise(resolve=>{
  const dialog=document.createElement('dialog');dialog.className='project-save-dialog';dialog.setAttribute('aria-labelledby','projectSaveTitle');
  dialog.innerHTML='<form><h2 id="projectSaveTitle">プロジェクトを保存</h2><label>プロジェクト名<input name="name" required maxlength="150" autocomplete="off"></label><label>保存先<input name="path" readonly placeholder="保存先を選択してください"></label><button type="button" data-choose>保存先を選ぶ…</button><p data-error role="status"></p><div class="save-menu-actions"><button type="submit" class="primary" data-save disabled>保存</button><button type="button" data-cancel>キャンセル</button></div></form>';
  document.body.append(dialog);const field=dialog.querySelector('[name=name]'),path=dialog.querySelector('[name=path]'),error=dialog.querySelector('[data-error]'),save=dialog.querySelector('[data-save]');field.value=name||'キャラクター';let choice=null,busy=false;
  const end=result=>{dialog.close();dialog.remove();resolve(result);};
  dialog.querySelector('[data-cancel]').onclick=()=>end(null);dialog.addEventListener('cancel',e=>{e.preventDefault();if(!busy)end(null);});
  dialog.querySelector('[data-choose]').onclick=async()=>{
   if(!field.value.trim()){error.textContent='プロジェクト名を入力してください。';field.focus();return;}busy=true;error.textContent='保存先を選択しています…';for(const b of dialog.querySelectorAll('button'))b.disabled=true;
   try{const r=await fetch('/api/project-saves/choose',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({request_id:crypto.randomUUID(),name:field.value.trim()})}),v=await r.json();if(!r.ok)throw Error(typeof v.detail==='string'?v.detail:'保存先を選択できませんでした。');if(v.ticket){choice=v;path.value=v.path;path.title=v.path;}error.textContent='';}
   catch(e){error.textContent=e.message;}finally{busy=false;for(const b of dialog.querySelectorAll('button'))b.disabled=false;save.disabled=!choice;}
  };
  dialog.querySelector('form').onsubmit=e=>{e.preventDefault();if(!busy&&choice&&field.value.trim())end({...choice,name:field.value.trim()});};dialog.showModal();field.select();
 });
}
