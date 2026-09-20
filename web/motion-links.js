import {partLabel} from './part-label.js';
import {motionLinkOwner} from './attachments.js';
import {headAttachment} from './face-rig.js';
import {secondaryMesh,secondaryKind,normalizeSecondary} from './secondary-motion.js';

export const linkSource=p=>['front','back'].includes(p.deformGroup);
export const attachmentSource=p=>!p.followPart&&!/^(lash|iris|white|brow)-/.test(p.role)&&p.role!=='mouth';
// Old saved clothing links are intentionally retired; retain standalone hem motion.
export function retireClothingLinks(project){
  const retired=new Set(project.parts.filter(part=>{const owner=part.motionLink&&motionLinkOwner(part,project.motionParts||project.parts);return part.motionLinkMode!=='attachment'&&owner&&secondaryMesh(owner);}));
  for(const part of project.parts){delete part.waistMotion;if(retired.has(part)){delete part.motionLink;delete part.motionLinkMode;delete part.motionLinkAnchor;}}
  return project;
}
const linkKeys=['followPart','motionLink','motionLinkMode','motionLinkAnchor','waistMotion'];
const revision=p=>JSON.stringify(p.parts.map(v=>[v.id,v.followPart||null,...linkKeys.map(k=>v[k]??null)]));
const finite=(v,lo,hi)=>Number.isFinite(v)&&v>=lo&&v<=hi;
export function validateMotionLinks(project){
  for(const part of project.parts){
    if(!part.motionLink)continue;
    const source=motionLinkOwner(part,project.parts),mode=part.motionLinkMode||'mesh';
    if(!source||source.followPart||part.followPart||!(mode==='attachment'?attachmentSource(source):mode==='rigid'&&linkSource(source)))throw Error('連結先が不正です。循環・不明なレイヤー・素材追従との重複を確認してください。');
    // Rigid attachment samples an unlinked source, avoiding ambiguous mixed chains.
    const direct=project.parts.find(v=>v.id===part.motionLink);
    if(direct.motionLink)throw Error('この連結方式では指定した基準を使えません');
    if(part.motionLinkAnchor&&(!finite(part.motionLinkAnchor.x,0,project.width)||!finite(part.motionLinkAnchor.y,0,project.height)))throw Error('取り付け位置はキャンバス内に指定してください');
  }
}
export function motionLinksState(project){return {
  revision:revision(project),
  sources:project.parts.filter(p=>attachmentSource(p)&&!p.motionLink).map(p=>({id:p.id,name:p.name,kind:secondaryKind(p)||p.deformGroup,motion:normalizeSecondary(p.secondaryMotion)})),
  parts:project.parts.map(p=>({id:p.id,name:p.name,visible:p.visible,source_id:p.motionLink||null,mode:p.motionLinkMode||'rigid',anchor:p.motionLinkAnchor||null,follow_part:p.followPart||null}))
};}
export function executeMotionLinks(project,command){
  if(!project)throw Error('先にキャラクターを読み込んでください');
  if(command.operation==='inspect')return motionLinksState(project);
  if(command.expected_revision!==undefined&&command.expected_revision!==revision(project))throw Error('別の操作で連結設定が変更されています。状態を取得してやり直してください');
  if(!['link','unlink'].includes(command.operation))throw Error('連結の操作が不正です');
  const source=project.parts.find(p=>p.id===command.source_id);
  if(!source||source.followPart||(command.operation==='link'&&!(command.mode==='attachment'?attachmentSource(source):linkSource(source))))throw Error('連動先には独立して動くレイヤーを指定してください');
  const next=project.parts.map(p=>({...p}));
  {
    if(!Array.isArray(command.part_ids)||!command.part_ids.length||new Set(command.part_ids).size!==command.part_ids.length)throw Error('連結するレイヤーを指定してください');
    const parts=command.part_ids.map(id=>{const p=project.parts.find(v=>v.id===id);if(!p||p===source)throw Error('連結するレイヤーが不正です');return p;});
    if(command.expected){
      if(Object.keys(command.expected).length!==parts.length)throw Error('変更前の連結先を全対象に指定してください');
      for(const p of parts)if(!Object.hasOwn(command.expected,p.id)||command.expected[p.id]!== (p.motionLink||(command.mode==='attachment'?p.followPart:null)||null))throw Error('別の操作で連結先が変更されています。状態を取得してやり直してください');
    }
    for(const part of parts){const p=next.find(v=>v.id===part.id);
      if(command.operation==='link'){
        if(command.mode==='attachment')delete p.followPart;
        p.motionLink=source.id;p.motionLinkMode=command.mode||'rigid';
        if(command.anchor)p.motionLinkAnchor={...command.anchor};
        else if(part.motionLink!==source.id||p.motionLinkMode!=='rigid')delete p.motionLinkAnchor;
      }else {if(p.motionLink===source.id){delete p.motionLink;delete p.motionLinkMode;delete p.motionLinkAnchor;}if(command.mode==='attachment'&&p.followPart===source.id)delete p.followPart;}
    }
  }
  validateMotionLinks({...project,parts:next});
  let changed=false;
  for(const part of project.parts){const update=next.find(v=>v.id===part.id);for(const k of linkKeys){if(JSON.stringify(update[k])!==JSON.stringify(part[k])){changed=true;if(update[k]!==undefined)part[k]=update[k];else delete part[k];}}}
  return {...motionLinksState(project),changed};
}

export function installMotionLinksUI(api){
 const card=document.createElement('section');card.id='motionLinksControls';card.className='control-card';
 card.innerHTML='<label>一緒に動くパーツ<select id="partMotionParent"></select></label><p class="tiny">連動先の移動・傾きに追従します。連動先を選んだら、02で動きを確認してください。</p><p class="tiny" role="status" data-link-status></p>';
 document.getElementById('selectedName').after(card);
 const select=card.querySelector('select'),status=card.querySelector('[data-link-status]');
 function refresh(){
  const p=api.project(),part=p?.parts.find(v=>v.id===api.selected());card.hidden=!part;if(!part)return;
  const sources=p.parts.filter(v=>v!==part&&attachmentSource(v)&&!v.motionLink);
  select.replaceChildren(new Option('連動なし',''),...sources.map(v=>new Option(partLabel(v),v.id)));select.value=part.motionLink||part.followPart||'';select.disabled=false;
 }
 select.onchange=()=>{
  const p=api.project(),part=p?.parts.find(v=>v.id===api.selected());if(!part)return;
  try{api.execute({operation:select.value?'link':'unlink',source_id:select.value||part.motionLink||part.followPart,part_ids:[part.id],mode:'attachment',expected_revision:revision(p),expected:{[part.id]:part.motionLink||part.followPart||null}});status.textContent='設定しました。02で動きを確認できます。';}
  catch(error){status.textContent=error.message;}refresh();
 };
 refresh();return {refresh};
}
