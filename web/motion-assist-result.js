// Confirm the applied animation on the existing motion stage; no TTS or output launch.
export function installMotionAssistResult({execute,retry,showMotion,projectId}){
 const card=document.createElement('section');card.id='motionAssistResult';card.className='control-card';card.hidden=true;
 card.innerHTML='<h3>AIの仕上げ</h3><p role="status"></p><div class="row"><button data-ok class="primary wide">これでOK</button><button data-retry>もう一回頼む</button></div><button data-undo class="wide">AIに頼む前に戻す</button>';
 document.getElementById('tab-motion').prepend(card);
 const $=s=>card.querySelector(s);let state=null,pending=false,dismissed=null;
 function update(next,operation){
  state=next;const eligible=next?.workflow?.mode==='from_inputs'&&next.project_id===projectId()&&next.applied;
  card.hidden=!eligible||dismissed===next?.session_id;
  if(eligible){$('p').textContent='目・口と動きを反映しました。プレビューで仕上がりを確認してください。';if(['finish','apply'].includes(operation)){dismissed=null;card.hidden=false;showMotion();}}
 }
 $('[data-ok]').onclick=()=>{dismissed=state?.session_id;card.hidden=true;};
 $('[data-retry]').onclick=()=>retry(state.workflow);
 $('[data-undo]').onclick=async()=>{if(pending)return;pending=true;$('[data-undo]').disabled=true;try{await execute({operation:'undo',operation_id:crypto.randomUUID(),session_id:state.session_id});}catch(e){$('p').textContent=e.message;}finally{pending=false;$('[data-undo]').disabled=false;}};
 return {update};
}
