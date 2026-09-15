import {lidDefaults,normalizeLid,lidProfile} from './eyelid-controls.js';
import {installEyeWorkbench} from './eye-workbench.js';
import {eyeCapabilities} from './shape-capabilities.js';
const $=id=>document.getElementById(id);
export function installRigEditor(api){
 const eye=document.createElement('details');eye.id='eyeEditor';
 const fields=[['x','横位置',-30,30,.5],['y','高さ',-30,30,.5],['angle','傾き（度）',-30,30,1],['width','横幅の倍率',.5,1.5,.05],['height','縦幅の倍率',.3,3,.05],['thickness','太さの倍率',.3,2,.05],['curve','カーブ',-15,15,.5],['spikes','トゲの長さ',0,2,.1]];
 eye.innerHTML='<summary>閉じ目の形を調整</summary><label>調整する目<select id="lidSide"><option value="r">画面左の目</option><option value="l">画面右の目</option></select></label><label hidden>確認する表情<select id="lidHold"><option value="">通常のアニメーション</option><option value="both">両目を閉じて固定</option><option value="r">画面左だけ閉じて固定</option><option value="l">画面右だけ閉じて固定</option></select></label><div class="coordinate-row" style="flex-wrap:wrap">'+fields.map(([k,label,min,max,step])=>`<label style="flex:1 1 40%">${label}<input id="lid-${k}" type="number" min="${min}" max="${max}" step="${step}"></label>`).join('')+'</div><p id="lidHint" class="tiny"></p><button id="lidReset" class="wide">この目を初期値に戻す</button><p class="tiny">左右別に保存されます。元の差分は残すので、いつでも戻せます。固定中は動きを停止し、PNGで現在の形を保存できます。</p>';
 ($('eyeEditorMount')||$('blinkTest').parentElement.parentElement).append(eye);
 const advanced=document.createElement('details');advanced.id='eyeNumbers';advanced.innerHTML='<summary>数値で微調整</summary><div class="coordinate-row"></div>';
 eye.append(advanced);
 for(const [key] of fields)advanced.querySelector('div').append(eye.querySelector('#lid-'+key).parentElement);
 const actions=document.createElement('div');actions.className='row';actions.innerHTML='<button id="eyeUndo">元に戻す</button><button id="eyeRedo">やり直す</button>';eye.insertBefore(actions,advanced);
 for(const note of eye.querySelectorAll('p.tiny'))note.hidden=true;

 const lash=()=>api.project()?.parts.find(p=>p.role==='lash-'+$('lidSide').value);
 const direct=installEyeWorkbench({project:api.project,part:lash,changed:p=>api.updateEye(p),refresh:refreshEye,select(side){$('lidSide').value=side;$('lidSide').dispatchEvent(new Event('change'));},history(h){$('eyeUndo').disabled=!h.canUndo;$('eyeRedo').disabled=!h.canRedo;}});
 $('eyeUndo').onclick=()=>direct.undo();$('eyeRedo').onclick=()=>direct.undo(true);
 function refreshEye(){const p=lash(),v=normalizeLid(p?.lidAdjust),caps=eyeCapabilities(p);for(const [k] of fields){const supported=k in caps?caps[k]:caps.transform;$('lid-'+k).value=v[k];$('lid-'+k).disabled=!supported;$('lid-'+k).closest('label').hidden=!supported;}if($('lid-thicknessOut'))$('lid-thicknessOut').value=Math.round(v.thickness*100)+'%';$('lidHint').textContent=!p?.closedSvgText?'閉じ目の差分がある素材を読み込んでください。':lidProfile(p.closedSvgText)?'元のまつ毛の塗り形状を調整します。':'追加した差分は位置・傾き・幅・太さを調整できます。';}
 for(const [k] of fields){let before;const input=$('lid-'+k);input.onfocus=()=>before=normalizeLid(lash()?.lidAdjust);input.onblur=()=>{if(before)direct.commit(before);before=null;};input.oninput=()=>{const p=lash();if(!p||input.value==='')return;before??=normalizeLid(p.lidAdjust);p.lidAdjust=normalizeLid({...lidDefaults,...p.lidAdjust,[k]:+input.value});api.updateEye(p);direct.refresh();};if(k==='thickness')input.onchange=()=>input.onblur();}
 $('lidSide').onchange=()=>{refreshEye();direct.refresh();};
 $('lidReset').onclick=()=>{const p=lash();if(!p)return;const before=normalizeLid(p.lidAdjust);delete p.lidAdjust;direct.commit(before);refreshEye();api.updateEye(p);};
 $('lidHold').onchange=()=>api.hold($('lidHold').value);
 function drawGuide(){direct.refresh();}
 return {beginEdit:direct.beginEdit,cancelEdit:direct.cancelEdit,refresh:refreshEye,drawGuide,resetHold(){ $('lidHold').value='';api.hold('');},flush(){}};
}
