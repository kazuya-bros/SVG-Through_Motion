// The result dialog shows one before/after pair. Detailed evidence remains in session storage.
export function installAssistPanel(execute,connect=async()=>{},retry=()=>{}){
  const dialog=document.createElement('dialog');dialog.className='shape-assist-dialog correction-dialog';dialog.setAttribute('aria-labelledby','correctionTitle');
  dialog.innerHTML='<div class="correction-heading"><h2 id="correctionTitle">AIの仕上げ</h2><button data-close aria-label="仕上げ画面を閉じる">閉じる</button></div>';
  const panel=document.createElement('section');panel.id='correctionPanel';
  panel.innerHTML=`<p data-field="status" role="status">「AIに任せる」から仕上げを依頼できます。</p>
    <div class="correction-pair" data-field="preview" hidden>
      <figure><figcaption>補正前</figcaption><img data-field="before" alt="補正前の顔"></figure>
      <span class="correction-arrow" aria-hidden="true">→</span>
      <figure><figcaption>補正後</figcaption><img data-field="after" alt="補正後の顔"></figure>
    </div>
    <p data-field="preview-status" class="tiny" role="status"></p>
    <button data-reload hidden>画像を再読み込み</button>
    <div class="correction-decisions"><button data-ok class="primary">これでOK</button><button data-retry>もう一回頼む</button></div>
    <button data-undo class="correction-undo">元に戻す</button>
    <button data-save hidden>仕上げを別保存</button>`;
  dialog.append(panel);document.body.append(dialog);
  const $=key=>panel.querySelector(`[data-field="${key}"]`),button=key=>panel.querySelector(`[data-${key}]`);
  let state=null,urls=[],previewKey=null,loading=false,pending=false;
  const ready=()=>!!state?.workflow?.assessment&&state.workflow.assessment.revision===state.revision;
  function buttons(){
    button('ok').hidden=!state||(!state.applied&&!ready());
    button('ok').textContent=state&&!state.applied&&!state.active?'編集へ戻る':'これでOK';
    button('ok').disabled=pending||loading||!!state?.workflow?.apply_error;
    button('retry').disabled=pending||loading||!!state?.active;
    button('undo').hidden=!state?.applied;button('undo').disabled=pending||loading;
    button('save').hidden=!state?.workflow?.apply_error;button('save').disabled=pending||loading;
  }
  function clearPreview(){urls.forEach(URL.revokeObjectURL);urls=[];previewKey=null;$('preview').hidden=true;for(const side of ['before','after'])$(side).removeAttribute('src');}
  const key=()=>state?`${state.session_id}:${state.revision}`:null;
  async function preview(){
    if(!dialog.open||!ready()||loading||previewKey===key())return;
    const wanted=key();loading=true;buttons();button('reload').hidden=true;$('preview-status').textContent='仕上がりを読み込んでいます…';
    try{
      const images=await execute({operation:'preview',session_id:state.session_id,revision:state.revision});
      if(key()!==wanted)return;
      clearPreview();urls=images.map(blob=>URL.createObjectURL(blob));
      $('before').src=urls[0];$('after').src=urls[1];$('preview').hidden=false;previewKey=wanted;$('preview-status').textContent='';
    }catch(error){if(key()===wanted){$('preview-status').textContent='画像を読み込めませんでした。'+error.message;button('reload').hidden=false;}}
    finally{loading=false;buttons();if(key()!==wanted&&dialog.open)void preview();}
  }
  function updated(next){
    const old=key();state=next;if(old!==key()){clearPreview();$('preview-status').textContent='';button('reload').hidden=true;}
    buttons();if(!next)return;
    try{localStorage.setItem('svgthrough.assist.last.'+next.project_id,next.session_id);}catch{}
    const phase={editing:'仕上げを調整しています。',awaiting_agent:'AIへの依頼を受け付けました。',reviewing:'AIが仕上げています。',waiting_asset:'仕上げ用の素材を作っています。',ready_for_review:'この仕上がりでよければ、絵に反映します。',applied:'仕上がりを反映しました。',undone:'AIに頼む前の絵に戻しました。',cancelled:'依頼を終了しました。'};
    $('status').textContent=next.workflow?.apply_error?'編集中の変更があるため、仕上げはまだ反映していません。別保存できます。':phase[next.workflow?.status]||(next.active?'仕上げ中です。':'依頼を終了しました。');
    // Controller notifications arrive before its command lock is released.
    if(dialog.open)setTimeout(()=>void preview(),0);
  }
  async function action(operation){
    if(!state||pending)return false;pending=true;buttons();
    try{await execute({operation,operation_id:crypto.randomUUID(),session_id:state.session_id,revision:state.revision});if(operation==='save')$('status').textContent='仕上げを別保存しました。';return true;}
    catch(error){$('status').textContent=error.message;return false;}
    finally{pending=false;buttons();}
  }
  dialog.querySelector('[data-close]').onclick=()=>dialog.close();
  button('ok').onclick=async()=>{if(!state?.active||state?.applied||await action('apply'))dialog.close();};
  button('retry').onclick=()=>{dialog.close();retry(state);};
  button('undo').onclick=()=>action('undo');button('save').onclick=()=>action('save');button('reload').onclick=()=>preview();
  buttons();
  return {updated,open(){dialog.showModal();void(async()=>{
    try{
      if(!state){const current=await execute({operation:'inspect'});let last;try{last=localStorage.getItem('svgthrough.assist.last.'+current.live?.project_id);}catch{}
        if(!current.session&&last){await execute({operation:'resume',session_id:last});if(state?.active)await connect();}
      }
      await preview();
    }catch(error){$('status').textContent=error.message;}
  })();},showReview(){/* Full review pages are saved for the agent, not displayed here. */}};
}
