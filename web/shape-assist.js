export function shapeAssistTargets(project,step){
  if(!['eyes','mouth','motion'].includes(step))throw Error('目・口または動きを指定してください');
  return (project?.parts||[]).filter(p=>p.visible!==false&&p.closedSvgText&&(step==='motion'?/^lash-[lr]$/.test(p.role)||p.role==='mouth':step==='eyes'?/^lash-[lr]$/.test(p.role):p.role==='mouth')).map(p=>p.id);
}
export function assistHandoffPrompt(id){return `SVG-Throughの仕上げをお願いします。接続先: ${location.origin}、補正session_id: ${id}。まず ${location.origin}/api/assist/info で作業フォルダを確認し、${location.origin}/api/assist/guide を読んでください。そのフォルダの tools/assist_agent.py --url ${location.origin} begin --session ${id} から受理・比較画像の確認・対象部位の補正・finishで所見の記録まで進めてください。対象、希望と生成利用可否はinspectで確認してください。`;}
export function installShapeAssist({snapshot,execute,connect,showResults}){
  const dialog=document.createElement('dialog');dialog.className='shape-assist-dialog';dialog.setAttribute('aria-labelledby','shapeAssistTitle');
  dialog.innerHTML=`<h2 id="shapeAssistTitle"></h2><p data-scope></p><p>依頼をコピーしてCodexへ渡します。AIが仕上げたら、この絵に反映します。気に入らなければ元に戻せます。</p>
    <label>仕上げの希望<textarea data-wish maxlength="2000"></textarea></label>
    <label><input type="checkbox" data-generation>画像生成による素材の補正も使う</label>
    <p class="tiny">依頼をCodexへ貼り付け、この編集画面を開いたまま進めてください。</p>
    <textarea data-prompt readonly hidden aria-label="AIへの依頼文"></textarea><p data-status role="status"></p>
    <div class="row"><button data-create class="primary">依頼を作ってコピー</button><button data-results>補正候補・結果を確認</button><button data-close>閉じる</button></div>`;
  document.body.append(dialog);const $=s=>dialog.querySelector(s);let targets=[],step='eyes',sid=null;
  $('[data-close]').onclick=()=>dialog.close();$('[data-results]').onclick=()=>{dialog.close();showResults();};
  $('[data-create]').onclick=async()=>{
    const button=$('[data-create]');button.disabled=true;
    try{
      if(!sid){const state=await execute({operation:'start',operation_id:crypto.randomUUID(),request_ai:true,auto_apply:true,mode:step==='motion'?'from_inputs':'finish',targets,wish:$('[data-wish]').value,allow_generation:$('[data-generation]').checked});sid=state.session_id;}
      await connect();const prompt=$('[data-prompt]');prompt.hidden=false;prompt.value=assistHandoffPrompt(sid);
      $('[data-wish]').disabled=$('[data-generation]').disabled=true;button.textContent='依頼文をコピー';
      try{await navigator.clipboard.writeText(prompt.value);$('[data-status]').textContent='依頼をコピーしました。Codexへ貼り付けてください。';}
      catch{$('[data-status]').textContent='依頼文を作りました。上の欄からコピーしてCodexへ渡してください。';}
    }catch(e){$('[data-status]').textContent=e.message;}finally{button.disabled=false;}
  };
  return async function open(nextStep,previous=null){
    step=nextStep;sid=null;targets=shapeAssistTargets(await snapshot(),step);if(!targets.length)throw Error('補正できる閉じ形がありません。素材を読み込んでください');
    const eye=step==='eyes';$('#shapeAssistTitle').textContent=eye?'閉じ目をAIに任せる':'閉じ口をAIに任せる';
    $('[data-scope]').textContent=eye?`対象は表示中の閉じ目（${targets.length}パーツ）です。口は変更しません。`:'対象は表示中の閉じ口です。目は変更しません。';
    $('[data-wish]').value=eye?'元絵の絵柄を保ち、閉じ目の位置・幅・傾きと開閉途中を確認して自然な瞬きに整えてください。':'元絵の絵柄を保ち、閉じ口の位置・形と開閉途中を確認して自然な口パクに整えてください。';
    if(step==='motion'){$('#shapeAssistTitle').textContent='目・口と動きをAIに任せる';$('[data-scope]').textContent='目・口の補正と動きの調整まで。TTS・声の選択や出力の起動は自分で行います。';$('[data-wish]').value='元絵を保ち、自然な瞬きと口の開閉、控えめな待機の動きに整えてください。';}
    $('[data-wish]').disabled=$('[data-generation]').disabled=false;$('[data-generation]').checked=false;
    if(previous){
      $('#shapeAssistTitle').textContent='もう一回AIに頼む';$('[data-wish]').value=previous.wish||$('[data-wish]').value;$('[data-generation]').checked=!!previous.allow_generation;
      const live=await snapshot(),available=[...shapeAssistTargets(live,'eyes'),...shapeAssistTargets(live,'mouth')];
      if(previous.targets?.length&&previous.targets.every(id=>available.includes(id))){targets=[...previous.targets];$('[data-scope]').textContent=step==='motion'?'前回と同じ目・口と動きを仕上げます。TTS・声や出力の起動は自分で行います。':`前回と同じ${targets.length}パーツを仕上げます。希望を変えて依頼できます。`;}
    }
    $('[data-prompt]').hidden=true;$('[data-status]').textContent='';$('[data-create]').textContent='依頼を作ってコピー';$('[data-create]').disabled=false;
    const current=(await execute({operation:'inspect'})).session;
    if(current?.active){
      if(current.workflow.targets.length===targets.length&&targets.every(id=>current.workflow.targets.includes(id))&&current.project_id===(await snapshot()).id){sid=current.session_id;$('[data-wish]').value=current.workflow.wish;$('[data-generation]').checked=current.workflow.allow_generation;$('[data-wish]').disabled=$('[data-generation]').disabled=true;$('[data-create]').textContent='作成済みの依頼をコピー';}
      else{$('[data-create]').disabled=true;$('[data-status]').textContent='進行中の別の補正候補があります。「補正候補・結果を確認」から採用または終了してから依頼してください。';}
    }
    dialog.showModal();
  };
}
