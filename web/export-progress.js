// Shared export feedback. Percentages describe the current stage, not a guessed ETA.
export const exportProgress={
 active:false,
 update(text){
  if(!this.active)return;
  this.message.textContent=text;
  const match=text.match(/(\d+)%/);
  if(match)this.bar.value=Math.min(100,Number(match[1]));
  else this.bar.removeAttribute('value');
 },
 async run(label,work,result){
  if(this.active)throw Error('書き出し中です。完了までお待ちください。');
  const dialog=document.createElement('dialog');dialog.className='export-progress';
  dialog.setAttribute('aria-labelledby','exportProgressTitle');
  dialog.innerHTML='<div class="export-progress-mark" aria-hidden="true"></div><h2 id="exportProgressTitle" tabindex="-1"></h2><p class="export-progress-message" role="status" aria-live="polite"></p><progress max="100" aria-label="現在の工程の進捗"></progress><p class="export-progress-note">処理が終わるまで、この画面を開いたままお待ちください。</p><button class="export-progress-file wide" type="button" hidden>保存先フォルダを開く</button><button class="primary wide" type="button" hidden>閉じる</button>';
  const title=dialog.querySelector('h2'),button=dialog.querySelector('.primary'),link=dialog.querySelector('.export-progress-file'),note=dialog.querySelector('.export-progress-note');
  this.message=dialog.querySelector('[role=status]');this.bar=dialog.querySelector('progress');
  this.active=true;title.textContent=label+'を書き出しています';this.update('素材と描画の準備中…');
  dialog.addEventListener('cancel',e=>{if(this.active)e.preventDefault();});
  button.onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  document.body.append(dialog);dialog.showModal();title.focus();
  try{
   // Paint feedback before cloning assets or generating a large SVG/ZIP.
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   const value=await work();
   title.textContent=label+'の書き出しが完了しました';this.bar.value=100;
   dialog.dataset.state='completed';note.textContent='保存先で、書き出したファイルを確認できます。';
   const saved=result?.();if(saved?.url){
    link.title=saved.path||'';link.hidden=false;
    link.onclick=async()=>{
     link.disabled=true;
     try{
      const url=new URL(saved.url,location.href);
      if(url.origin!==location.origin||!/^\/api\/exports\/[a-f0-9]{32}\/[a-zA-Z0-9_.-]{1,80}$/.test(url.pathname))throw Error('保存先を確認できませんでした。');
      const response=await fetch(url.pathname+'/reveal',{method:'POST'});
      if(!response.ok){const error=await response.json().catch(()=>({}));throw Error(error.detail||'保存先フォルダを開けませんでした。');}
      note.textContent='書き出したファイルを選択して、保存先フォルダを開きました。';
     }catch(error){note.textContent=error.message;}
     finally{link.disabled=false;}
    };
   }
   return value;
  }catch(error){
   title.textContent='書き出しに失敗しました';this.message.textContent=error.message||'処理を完了できませんでした。';
   this.bar.hidden=true;dialog.dataset.state='failed';note.textContent='閉じて設定を確認し、もう一度お試しください。';throw error;
  }finally{this.active=false;button.hidden=false;button.focus();}
 }
};
