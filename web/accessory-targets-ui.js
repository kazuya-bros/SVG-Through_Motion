import {tailEnabled,wingEnabled,inferredEar,inferredWing,accessorySelection,chooseAccessory} from './accessory-targets.js';
import {earEnabled} from './idle-expression.js';
import {partLabel} from './part-label.js';
import {normalizeSecondary} from './secondary-motion.js';
// The target selector changes animation assignment; the second selector only
// chooses which of the inferred left/right layers receives a pivot edit.
export function installAccessoryTargets({project,changed,pick}){
 const $=id=>document.getElementById(id),groups=[];
 const wing=document.createElement('section');wing.id='wingMotionControls';wing.className='control-card';
 wing.innerHTML='<h3>翼の揺れ</h3><label class="toggle-row">翼を動かす<input type="checkbox" id="wingEnabled"></label><label class="slider-label">揺れの大きさ<input id="wingAmount" type="range" min="0" max="100"></label><label class="slider-label">速さ<input id="wingCycles" type="range" min="1" max="4" step="1"></label><button id="wingPivotPick" type="button">画面で付け根を指定</button>';
 $('motion-extra').append(wing);
 for(const [kind,title,enabled,parent] of [['ear','耳',earEnabled,'earsAccessoryControls'],['tail','尻尾',tailEnabled,'tailMotionControls'],['wing','翼',wingEnabled,'wingMotionControls']]){
  const mount=$(parent),button=$(kind+'PivotPick');let select=$(kind+'Target');
  if(!select){const label=document.createElement('label');label.textContent='動かすレイヤー';select=document.createElement('select');select.id=kind+'Target';label.append(select);mount.querySelector('h3').after(label);}
  const pivotLabel=document.createElement('label');pivotLabel.textContent='支点を調整するレイヤー';const pivot=document.createElement('select');pivot.id=kind+'PivotTarget';pivotLabel.append(pivot);button.before(pivotLabel);
  const targets=()=>project()?.parts.filter(p=>p.visible&&enabled(p))||[];
  function refresh(){if(!project())return;mount.hidden=false;const old=pivot.value,parts=targets();
   const both=['ear','wing'].includes(kind)&&project().parts.filter(kind==='ear'?inferredEar:inferredWing).length>1?[new Option(kind==='ear'?'両耳（左右をまとめて動かす）':'両翼（左右をまとめて動かす）','both')]:[];
   select.replaceChildren(new Option('自動推定','auto'),...both,new Option('なし','none'),...project().parts.map(p=>new Option(partLabel(p)+(p.visible?'':'（非表示）'),p.id)));select.value=accessorySelection(project(),kind);
   pivot.replaceChildren(...parts.map(p=>new Option(partLabel(p),p.id)));if(parts.some(p=>p.id===old))pivot.value=old;if(!parts.length)pivot.append(new Option('対象レイヤーなし',''));
   pivot.disabled=button.disabled=!parts.length;button.hidden=false;
   if(kind==='wing'){const c=normalizeSecondary(parts[0]?.secondaryMotion);$('wingEnabled').checked=c.enabled;$('wingAmount').value=c.amount;$('wingCycles').value=c.cycles;for(const id of ['wingEnabled','wingAmount','wingCycles'])$(id).disabled=!parts.length;}
   if(kind==='tail')for(const id of ['tailSwing','tailCycles'])$(id).disabled=!parts.length;
  }
  select.onchange=()=>{chooseAccessory(project(),kind,select.value);changed();};
  button.onclick=()=>{const p=targets().find(p=>p.id===pivot.value);if(p)pick([p]);};groups.push({refresh});
 }
 for(const id of ['wingEnabled','wingAmount','wingCycles'])$(id).oninput=()=>{for(const p of project().parts.filter(wingEnabled))p.secondaryMotion=normalizeSecondary({...p.secondaryMotion,enabled:$('wingEnabled').checked,amount:+$('wingAmount').value,cycles:+$('wingCycles').value});changed();};
 return {refresh(){groups.forEach(g=>g.refresh());}};
}
