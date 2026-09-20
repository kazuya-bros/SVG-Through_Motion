export const tailEnabled=p=>typeof p.tailMotion==='boolean'?p.tailMotion:p.role==='tail';
export const inferredWing=p=>/^(?:wings?|翼)(?:[-_][lr])?$/i.test(p.sourceLayerName||p.name||'')||/wings|翼/i.test(p.sourceLayerName||p.name||'');
export const wingEnabled=p=>typeof p.wingMotion==='boolean'?p.wingMotion:inferredWing(p);
export const inferredEar=p=>/^ear-[lr]$/.test(p.role)||/^(?:ears?[-_][lr]|[左右]耳)$/i.test(p.sourceLayerName||p.name||'');
export function accessorySelection(project,kind){
 const key=kind+'Motion',chosen=project.parts.filter(p=>p[key]===true);
 if(project.parts.every(p=>p[key]===undefined))return 'auto';
 return ['ear','wing'].includes(kind)&&chosen.length>1?'both':chosen[0]?.id||'none';
}
export function chooseAccessory(project,kind,target){
 if(!['ear','tail','wing'].includes(kind)||!['auto','none',...(['ear','wing'].includes(kind)?['both']:[]),...project.parts.map(p=>p.id)].includes(target))throw Error('対象レイヤーが不正です');
 const inferred=kind==='ear'?inferredEar:inferredWing;
 if(target==='both'&&project.parts.filter(inferred).length<2)throw Error(kind==='ear'?'左右の耳レイヤーが見つかりません':'左右の翼レイヤーが見つかりません');
 for(const p of project.parts){if(target==='auto')delete p[kind+'Motion'];else p[kind+'Motion']=target==='both'?inferred(p):p.id===target;}
}
