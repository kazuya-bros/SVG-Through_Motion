export function installAssistEntry(){
  let generation=0;
  const box=document.createElement('section');box.className='control-card';box.id='assistEntry';
  box.innerHTML=`<h3>仕上げ方を選ぶ</h3><label><input type="radio" name="assistEntryMode" value="manual" checked>自分で調整する</label>
  <label><input type="radio" name="assistEntryMode" value="ai">目・口と動きをAIに任せる</label><p class="tiny">AIに任せる場合は、依頼をコピーしてCodexへ渡します。</p>
  <p class="tiny" data-manual-hint>途中からAIに頼むこともできます。</p><div data-ai-options hidden><label>仕上がりの希望<textarea maxlength="2000" placeholder="例：元絵の表情を保って、自然な瞬きと控えめな待機の動きに"></textarea></label>
  <label><input type="checkbox" data-generation>画像生成による素材の補正も使う</label>
  <p class="tiny">目・口を整え、動きをつけるところまでAIに任せます。TTS・声の選択や出力の起動は自分で行います。</p><p class="tiny">元画像と対応PSDを登録し、依頼をCodexへ渡します。この画面を開いたまま進めてください。</p></div>
  <div data-handoff hidden><p role="status">素材登録済み。依頼をコピーしてCodexへ渡してください。</p><textarea readonly data-prompt></textarea><button type="button" data-copy>AIへの依頼をコピー</button></div>`;
  document.getElementById('finishMethodMount').append(box);
  const enabled=()=>box.querySelector('[name=assistEntryMode]:checked').value==='ai';
  box.querySelectorAll('[name=assistEntryMode]').forEach(e=>e.onchange=()=>{box.querySelector('[data-ai-options]').hidden=!enabled();box.querySelector('[data-manual-hint]').hidden=enabled();document.getElementById('hybridImport').textContent=enabled()?'素材を登録してAIに渡す':'読み込んで編集を始める';});
  box.querySelector('[data-copy]').onclick=async()=>{await navigator.clipboard.writeText(box.querySelector('[data-prompt]').value);};
  async function track(id,ticket){
    if(ticket!==generation)return;
    try{const response=await fetch('/api/assist/inputs/'+id);if(!response.ok)throw Error('状態を取得できません');const state=await response.json();if(ticket!==generation)return;
      const status=box.querySelector('[role=status]');
      status.textContent=state.state==='awaiting_agent'?'素材登録済み。依頼をコピーしてCodexへ渡してください。':state.state==='done'?'変換完了。AIが編集画面で確認を進めます。':(state.message||'AIが素材を変換しています…');
      if(['done','error','interrupted'].includes(state.state))return;
    }catch{box.querySelector('[role=status]').textContent='接続を待っています。依頼文を残しておくと再開できます。';}
    setTimeout(()=>track(id,ticket),2000);
  }
  return {options:()=>({enabled:enabled(),wish:box.querySelector('[data-ai-options] textarea').value,allow_generation:box.querySelector('[data-generation]').checked}),
    handoff(id){box.querySelector('[data-handoff]').hidden=false;box.querySelector('[data-prompt]').value=`SVG-Throughの制作を、目・口の補正から動きの調整まで進めてください。接続先: ${location.origin}、入力ID: ${id}。まず ${location.origin}/api/assist/info で作業フォルダを確認し、${location.origin}/api/assist/guide を読んでください。そのフォルダの tools/assist_agent.py --url ${location.origin} begin --input ${id} から変換・画像確認・補正を進め、motionで希望に合う動きを設定し、最新の開閉・モーション比較を確認してfinishしてください。仕上げは自動反映され、動きをつける画面でユーザーが確認します。元の絵柄を保ち、必要な補正だけ行ってください。TTSエンジン・声・音声設定は変更せず、発話や出力ウィンドウの起動、書き出しは行わないでください。`;void track(id,++generation);}};
}
