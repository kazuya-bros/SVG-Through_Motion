// Pure, typed edits shared by the local correction panel and remote agents.
import {normalizeLid,lidProfile} from './eyelid-controls.js';
import {normalizeMouthTuning} from './vowels.js';
import {closedProfile} from './closed-mouth.js';
import {canonicalSvgText} from './raster-source.js';
import {motionValues,applyMotionEdit,validateMotion} from './assist-motion.js';

const transform={x:[-30,30,'px'],y:[-30,30,'px'],angle:[-30,30,'deg'],width:[.5,1.5,'ratio'],height:[.3,3,'ratio']};
export function editableParts(project){
  return project.parts.filter(p=>p.closedSvgText&&(p.role==='mouth'||/^lash-[lr]$/.test(p.role))).map(p=>{
    const eye=p.role!=='mouth',generated=!!(eye?lidProfile(p.closedSvgText):closedProfile(p.closedSvgText));
    const fields=structuredClone(transform);
    if(!eye){fields.angle=[-45,45,'deg'];fields.width=[.4,1.8,'ratio'];}
    if(generated){fields.curve=[-15,15,'px'];fields.thickness=[.3,eye?2:3,'ratio'];}
    const all=eye?normalizeLid(p.lidAdjust):normalizeMouthTuning(project.settings?.mouthTuning).closed;
    return {id:p.id,name:p.name||p.role,role:p.role,visible:p.visible!==false,generated,bounds:{x:p.x,y:p.y,width:p.width,height:p.height},
      values:Object.fromEntries(Object.keys(fields).map(k=>[k,all[k]])),
      fields:Object.fromEntries(Object.entries(fields).map(([k,[min,max,unit]])=>[k,{min,max,unit}]))};
  });
}
export function applyShapeEdit(project,partId,values){
  const part=editableParts(project).find(p=>p.id===partId);
  if(!part)throw Error('編集可能な閉じ目・閉じ口が見つかりません');
  if(!values||Array.isArray(values)||typeof values!=='object'||!Object.keys(values).length)throw Error('変更する絶対値を指定してください');
  for(const [key,value] of Object.entries(values)){
    const field=part.fields[key];
    if(!field||typeof value!=='number'||!Number.isFinite(value)||value<field.min||value>field.max)throw Error(`未対応または範囲外の値: ${key}`);
  }
  const copy=structuredClone(project),target=copy.parts.find(p=>p.id===partId);
  if(target.role==='mouth'){
    const tune=normalizeMouthTuning(copy.settings?.mouthTuning);
    tune.closed={...tune.closed,...values};copy.settings={...copy.settings,mouthTuning:tune};
  }else target.lidAdjust={...normalizeLid(target.lidAdjust),...values};
  return copy;
}

// Exact content comparison includes manual edits and asset changes, not OBS publication count.
export function projectStamp(project){return JSON.stringify(project,(key,value)=>typeof value==='string'&&(/svg/i.test(key)||value.startsWith('<svg'))?canonicalSvgText(value):value);}
export function createCorrectionSession(original,id,record=null){
  const base=structuredClone(original);
  const capture=p=>({parts:p.parts.map(part=>({id:part.id,...Object.fromEntries(['lidAdjust','closedSvgText','closedSource'].filter(k=>part[k]!==undefined).map(k=>[k,part[k]]))})),mouthTuning:p.settings?.mouthTuning,motion:motionValues(p.settings)});
  const materialize=state=>{const p=structuredClone(base);for(const part of p.parts){const saved=state.parts.find(v=>v.id===part.id);if(!saved)throw Error('保存されたパーツ構成が不正です');for(const k of ['lidAdjust','closedSvgText','closedSource']){if(saved[k]!==undefined)part[k]=structuredClone(saved[k]);else delete part[k];}}if(state.mouthTuning)p.settings.mouthTuning=structuredClone(state.mouthTuning);else delete p.settings.mouthTuning;return p;};
  const history=record?record.history.map(h=>{const project=materialize(h.state);if(h.state.motion&&Object.keys(h.state.motion).length){validateMotion(h.state.motion);project.settings={...project.settings,...h.state.motion};}return {reason:h.reason,project};}):[{project:structuredClone(base),reason:'start'}];
  if(!history.length||history.length>61)throw Error('保存された履歴数が不正です');
  let appliedStamp=record?.appliedStamp??null,active=record?.active??true;
  const revision=()=>history.length-1;
  function check(expected){
    if(!active)throw Error('この補正候補は終了しています');
    if(!Number.isInteger(expected)||expected!==revision())throw Error('候補が更新されています。inspectでrevisionを取り直してください');
  }
  function append(project,reason){
    if(history.length>=61)throw Error('補正履歴の上限60回に達しました。別保存して新しい候補を開始してください');
    history.push({project,reason});return inspect();
  }
  function inspect(){return {session_id:id,revision:revision(),active,applied:appliedStamp!==null,
    project_id:base.id,width:base.width,height:base.height,parts:editableParts(history.at(-1).project),
    history:history.map((item,i)=>({revision:i,reason:item.reason}))};}
  return {inspect,base:()=>structuredClone(base),candidate:()=>structuredClone(history.at(-1).project),
    serialize:()=>({id,base,history:history.map(h=>({reason:h.reason,state:capture(h.project)})),appliedStamp,active}),
    replace(expected,partId,svg){check(expected);const copy=this.candidate(),part=copy.parts.find(p=>p.id===partId);if(!part||!editableParts(copy).some(p=>p.id===partId))throw Error('閉じ形の対象がありません');part.closedSvgText=svg;part.closedSource='psd';if(part.role==='mouth'){copy.settings.mouthTuning={...normalizeMouthTuning(copy.settings.mouthTuning),closed:normalizeMouthTuning().closed};}else part.lidAdjust=normalizeLid();return append(copy,'asset:'+partId);},
    edit(expected,part,values){check(expected);return append(applyShapeEdit(history.at(-1).project,part,values),'edit:'+part);},
    motion(expected,values){check(expected);return append(applyMotionEdit(history.at(-1).project,values),'motion');},
    restore(expected,target){check(expected);if(!Number.isInteger(target)||!history[target])throw Error('復元先revisionがありません');return append(structuredClone(history[target].project),'restore:'+target);},
    apply(expected,live){check(expected);if(projectStamp(live)!==projectStamp(base))throw Error('元の編集内容が変わっています。補正候補を別保存するか、現在の状態からやり直してください');return this.candidate();},
    applied(live){appliedStamp=projectStamp(live);active=false;},
    undo(live){if(appliedStamp===null)throw Error('適用済みの補正がありません');if(projectStamp(live)!==appliedStamp)throw Error('適用後に編集されています。現在の編集を保存してから戻してください');return this.base();},
    undone(){appliedStamp=null;active=false;},
    cancel(){active=false;return inspect();}
  };
}
