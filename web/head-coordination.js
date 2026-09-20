// Head projection and default depths adapted from Anime2.5DRig (MIT). See THIRD_PARTY_NOTICES.md.
import {depthFaceOffset} from './depth-motion.js';
// Shared head projection. Imported parent links take precedence over local tuning.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,Number.isFinite(x)?x:a));
const smooth=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};
export function headKind(p){
 if(p.faceBase||/^face(?:[（(]|$)/i.test(p.name||''))return 'face';
 if(/^(lash|iris|white)-[lr]$/.test(p.role)||p.blinkOverlay)return 'eye';
 if(/^brow-[lr]$/.test(p.role)||p.faceOverlay)return 'brow';
 if(p.role==='mouth')return 'mouth';
 if(['front','back'].includes(p.deformGroup))return p.deformGroup;
 if(p.role==='hair')return 'back';
 if(p.earMotion||/^(ear-[lr]|glasses)$/.test(p.role)||/headwear|eyewear|earwear|頭飾り|眼鏡|耳飾り/i.test(p.sourceLayerName||p.name||''))return 'accessory';
 if(/topwear|bottomwear|legwear|footwear|handwear|neckwear|wings|tail/i.test(p.sourceLayerName||p.name||''))return 'body';
 if(p.role==='static'&&!p.independentAccessory&&(!p.deformGroup||p.deformGroup==='core'))return 'neck';
 return 'body';
}
export function headSettings(s={}){
 // Upgrade the former opt-in prototype once; later explicit API choices persist.
 return {...s,faceCoordination:s.headMotionVersion===2?s.faceCoordination!==false:true,headMotionVersion:2,
  headIdle:s.headIdle!==false,headYawOffset:clamp(s.headYawOffset??0,-1,1),headRollOffset:clamp(s.headRollOffset??0,-8,8)};
}
export function headTuning(p){
 const kind=headKind(p),v=p.headFollow||{},name=p.sourceLayerName||p.name||'';
 const depth=/headwear|頭飾り|髪飾り/i.test(name)?1.20:/eyewear|眼鏡/i.test(name)||p.role==='glasses'?1.18:
  /earwear|耳飾り/i.test(name)?.97:kind==='accessory'?.96:
  /bottomwear/i.test(name)?.88:/legwear/i.test(name)?.84:/footwear/i.test(name)?.80:/handwear/i.test(name)||/^arm-/.test(p.deformGroup||'')?.86:
  /neckwear/i.test(name)?.98:p.role==='tail'||p.deformGroup==='tail'?.58:/wing/i.test(p.role||name)?.70:
  ({eye:1.08,mouth:1.08,brow:1.14,front:1.28,back:.55,face:1,neck:.95,body:.90}[kind]??1);
 return {amount:clamp(v.amount??1,0,1),depth:clamp(v.depth??depth,.5,1.4)};
}
export function validateHeadTuning(v){if(!v||Object.keys(v).some(k=>!['amount','depth'].includes(k))||!Number.isFinite(v.amount)||v.amount<0||v.amount>1||!Number.isFinite(v.depth)||v.depth<.5||v.depth>1.4)throw Error('顔の追従量・奥行きが範囲外です');return {amount:v.amount,depth:v.depth};}
export function coordinatedWeight(x,y,p){
 const part=p.parts[0],kind=part&&headKind(part);if(!kind)return 0;
 const amount=headTuning(part).amount;if(kind==='body')return amount*.16;if(kind!=='neck')return amount;
 const r=p.rig,range=r.faceWidth*clamp(p.settings?.faceNeckBlend??.35,.15,.6);
 const vertical=1-smooth((y-(r.neckY-range))/(range*2));
 const side=1-smooth((Math.abs(x-r.neckX)-r.faceWidth*.45)/(r.faceWidth*.35));
 return amount*(.16+.84*vertical*side);
}
export function coordinatedHeadPoint(x,y,p,pose){
 const weight=coordinatedWeight(x,y,p);if(!weight)return [x,y];
 const r=p.rig,t=headTuning(p.parts[0]),fs=r.faceWidth/333;
 const yaw=clamp(pose.yaw??0,-1,1),pitch=clamp(pose.pitch??0,-1,1),z=t.depth-1;
 const roll=(clamp(pose.headRoll??0,-8,8)-clamp(pose.bodyRoll??0,-8,8))*Math.PI/360,dx=x-r.neckX,dy=y-r.neckY;
 const rx=r.neckX+dx*Math.cos(roll)-dy*Math.sin(roll),ry=r.neckY+dx*Math.sin(roll)+dy*Math.cos(roll);
 const [extraX,extraY]=depthFaceOffset(x,y,p,pose,weight);
 return [extraX+x+weight*(rx-x+fs*yaw*(14+40*z+(r.neckY-ry)*.028)),extraY+y+weight*(ry-y-fs*pitch*(9+30*z+z*(ry-r.faceY)*.05)+clamp(pose.nod??0,-6,6))];
}
const revision=p=>JSON.stringify([p.settings.faceCoordination===true,p.settings.faceNeckBlend??.35,p.parts.map(v=>[v.id,v.headFollow||null,v.followPart||null,v.motionLink||null])]);
export function executeHeadMotion(p,c){
 if(!p)throw Error('キャラクターを読み込んでください');
 const state=()=>({revision:revision(p),enabled:p.settings.faceCoordination===true,neck_blend:p.settings.faceNeckBlend??.35,parts:p.parts.filter(headKind).map(v=>({id:v.id,kind:headKind(v),parent:v.motionLink||v.followPart||null,...headTuning(v)}))});
 if(c.operation==='inspect')return state();
 if(!['update','reset'].includes(c.operation))throw Error('顔の調整の操作が不正です');
 if(c.expected_revision!==undefined&&c.expected_revision!==revision(p))throw Error('顔の設定が変更されています。状態を取得してやり直してください');
 const ids=c.part_ids||[];if(new Set(ids).size!==ids.length)throw Error('対象が重複しています');
 const targets=ids.map(id=>{const v=p.parts.find(v=>v.id===id);if(!v||!headKind(v)||v.followPart||v.motionLink)throw Error('連動中のパーツは連動元で調整してください');return v;});
 if(c.enabled!==undefined&&typeof c.enabled!=='boolean')throw Error('有効・無効の指定が不正です');
 if(c.neck_blend!==undefined&&(!Number.isFinite(c.neck_blend)||c.neck_blend<.15||c.neck_blend>.6))throw Error('首のなじませ範囲が不正です');
 const tuning=c.tuning?validateHeadTuning(c.tuning):null;if(tuning&&!targets.length)throw Error('対象のパーツを指定してください');
 const roles=new Set(targets.map(v=>v.role));
 for(const part of p.parts){if((part.faceOverlay&&roles.has(part.faceOverlay)||part.blinkOverlay&&roles.has('lash-'+part.blinkOverlay))&&!part.motionLink&&!part.followPart&&!targets.includes(part))targets.push(part);}
 const before=revision(p);
 for(const v of targets){if(c.operation==='reset')delete v.headFollow;else if(tuning)v.headFollow={...tuning};}
 if(c.enabled!==undefined)p.settings.faceCoordination=c.enabled;
 if(c.neck_blend!==undefined)p.settings.faceNeckBlend=c.neck_blend;
 return {...state(),changed:before!==revision(p)};
}
