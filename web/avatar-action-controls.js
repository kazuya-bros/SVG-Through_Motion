import {normalizeExpressions} from './expression-presets.js';
import {defaultLook} from './broadcast-look.js';
const kinds={glitch:'輪郭ノイズ',blocks:'ノイズブロックから現れる',expression:'表情',hide:'消える',ink:'線から色へ登場',dissolve:'サラサラ消える',appear:'粒から現れる',comms:'通信っぽいエフェクト',happy:'幸せの光',bounce:'はずみ',outline:'縁取り',blush:'照れ',sweat:'小さい冷や汗',gloom:'どんより',light:'ライティング'};
const animated=new Set(['ink','dissolve','appear','comms','happy','bounce','glitch','blocks']);
export function installAvatarActionControls({host,sid,project,lookControls}){
 const root=document.createElement('section');root.id='avatarActions';
 root.innerHTML=`<label>演出名<input data-name type="text" maxlength="60" placeholder="新しい演出"></label><label>表示時間<select data-behavior><option value="select">次の演出を選ぶまで</option><option value="timed">指定時間だけ</option></select></label><label data-time-label>表示時間（秒）<input data-duration type="number" min=".5" max="30" step=".5" value="6"></label><div data-components></div><div class="component-add"><label>組み合わせる要素<select data-kind></select></label><button data-add class="wide">＋ 要素を追加</button></div><section data-component-editor></section><div data-look-mount></div><button data-save class="wide primary">演出を保存</button><p data-status class="tiny" role="status"></p>`;
 host.prepend(root);root.querySelector('[data-look-mount]').append(document.getElementById('broadcastLook'));
 const $=k=>root.querySelector((k==='status'?':scope > ':'')+'[data-'+k+']'),list=document.getElementById('effectList'),add=document.getElementById('effectAdd'),del=document.getElementById('effectDelete'),play=document.getElementById('effectPreview'),stop=document.getElementById('effectStop'),playing=document.getElementById('effectPreviewStatus'),names=normalizeExpressions(project.expressionPresets);
 let selectedKind=null;
 let rows=[],components=[],online=false,busy=false,editing=null,selected=null,previewId=null,previewSeen=false,checkpoint=null;const expanded=new Set();
 const status=t=>$('status').textContent=t;
 const dirty=()=>checkpoint!==null&&JSON.stringify(draft())!==checkpoint;
 const canDiscard=()=>!dirty()||confirm('未保存の演出があります。変更を破棄しますか？');
 for(const [id,label]of Object.entries(kinds))$('kind').add(new Option(label,id));
 async function request(url,body,method='POST'){const r=await fetch(url,body?{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{}),v=await r.json();if(!r.ok)throw Error(typeof v.detail==='string'?v.detail:'演出の設定を確認してください');return v;}
 function buttons(){for(const e of [add,play,$('save'),$('add'),...root.querySelectorAll('.component-remove')])e.disabled=busy||!online;del.disabled=busy||!online||!!selected?.builtin;del.title=selected?.builtin?'標準の演出は削除できません':'';stop.disabled=busy||!online||!previewId;for(const e of list.querySelectorAll('summary'))e.setAttribute('aria-disabled',String(busy));}
 async function work(fn){if(busy)return;busy=true;buttons();try{await fn();}catch(e){status(e.message);}finally{busy=false;buttons();}}
 const componentLabel=c=>c.kind==='expression'?'表情：'+(names[c.expression_index]?.name||'通常'):kinds[c.kind]||c.kind;
 const parts=a=>a.visibility===false?[{kind:'hide'}]:a.kind==='bundle'?a.components||[]:kinds[a.kind]?[{kind:a.kind,direction:a.direction||'up',duration:a.duration||4,strength:a.strength??.7,expression_index:0}]:[];
 function renderList(){
  const entries=selected?rows:[{id:'draft',action:draft(),draft:true},...rows];list.replaceChildren();
  for(const row of entries){const active=row.draft||row.id===selected?.id,a=active?draft():row.action,details=document.createElement('details');details.className='effect-list-item';details.dataset.id=row.id;details.classList.toggle('selected',active);details.open=expanded.has(row.id);const summary=document.createElement('summary');summary.textContent=a.name+(active&&dirty()?' *':'');summary.setAttribute('aria-current',String(active));details.append(summary);
   const ul=document.createElement('ul'),items=active?components:parts(a);for(const c of items.length?items:[{kind:'normal'}]){const li=document.createElement('li');li.textContent=c.kind==='normal'?'通常表示':componentLabel(c);ul.append(li);}details.append(ul);
   details.addEventListener('toggle',()=>{if(details.open)expanded.add(row.id);else expanded.delete(row.id);});
   summary.onclick=e=>{if(busy){e.preventDefault();return;}if(active)return;e.preventDefault();void work(async()=>{if(!canDiscard())return;const wasPlaying=!!previewId;expanded.add(row.id);load(row);if(wasPlaying)await preview();});};list.append(details);
  }buttons();
 }
 function render(){
  $('time-label').hidden=$('behavior').value!=='timed';$('components').replaceChildren();$('component-editor').replaceChildren();
  if(!components.some(c=>c.kind===selectedKind))selectedKind=components[0]?.kind||null;
  components.forEach((c,i)=>{const row=document.createElement('div');row.className='component-choice';const choose=document.createElement('button');choose.type='button';choose.dataset.component=c.kind;choose.textContent=componentLabel(c);choose.setAttribute('aria-pressed',String(c.kind===selectedKind));choose.onclick=()=>{selectedKind=c.kind;render();};const remove=document.createElement('button');remove.type='button';remove.className='component-remove';remove.textContent='×';remove.setAttribute('aria-label',kinds[c.kind]+'を削除');remove.onclick=()=>void work(async()=>{components.splice(i,1);render();await preview();});row.append(choose,remove);$('components').append(row);});
  const c=components.find(c=>c.kind===selectedKind);
  if(c){const card=document.createElement('div');card.className='avatar-component';card.dataset.editingComponent=c.kind;const title=document.createElement('h3');title.textContent=kinds[c.kind]+'の設定';card.append(title);
   const select=(label,key,values)=>{const l=document.createElement('label');l.textContent=label;const e=document.createElement('select');for(const [v,t]of values)e.add(new Option(t,v));e.value=c[key];e.onchange=()=>{c[key]=key==='expression_index'?+e.value:e.value;const choice=root.querySelector('[data-component="'+c.kind+'"]');choice.textContent=componentLabel(c);renderList();};l.append(e);card.append(l);};
   const number=(label,key,min,max,step,range=false)=>{const l=document.createElement('label');l.textContent=label;const e=document.createElement('input');e.type=range?'range':'number';Object.assign(e,{min,max,step,value:c[key]});e.dataset.componentField=key;const caption=()=>{l.firstChild.textContent=key==='speed'?label+'（'+(+e.value).toFixed(2)+'倍）':label;};caption();e.oninput=()=>{c[key]=+e.value;caption();renderList();};l.append(e);card.append(l);};
   if(c.kind==='expression'){select('表情','expression_index',names.map((e,i)=>[i,e.name]));number('表情の強さ','strength',0,1,.05,true);}
   if(animated.has(c.kind)){select('方向','direction',[['up','上へ'],['down','下へ'],['left','左へ'],['right','右へ']]);number('動きの時間（秒）','duration',.5,30,.5);number('強さ','strength',0,1,.05,true);c.speed??=1;number('速さ','speed',.25,4,.05,true);}
   if(c.kind==='hide'){const p=document.createElement('p');p.className='tiny';p.textContent='キャラクターをすぐに非表示にします。';card.append(p);}
   if(c.kind==='expression'||animated.has(c.kind)||c.kind==='hide')$('component-editor').append(card);
  }else{const p=document.createElement('p');p.className='tiny';p.textContent='要素を追加して設定します。';$('component-editor').append(p);}
  lookControls.select(components.map(c=>c.kind),selectedKind);$('save').textContent=selected?.builtin?'別の演出として保存':'演出を保存';renderList();
 }
 function draft(){return {name:$('name').value.trim()||'新しい演出',project_id:project.id||'',kind:'bundle',components:structuredClone(components.filter(c=>c.kind!=='hide')),visibility:!components.some(c=>c.kind==='hide'),behavior:$('behavior').value,duration:+$('duration').value,appearance:lookControls.getLook()};}
 async function refresh(){rows=await request('/api/avatar/presets?project_id='+encodeURIComponent(project.id||''));renderList();}
 function load(row){cancelLive();selected=row||null;editing=row&&!row.builtin?row:null;const a=row?.action||{name:'新しい演出',kind:'bundle',components:[],visibility:true};$('name').value=a.name;$('behavior').value=a.behavior==='timed'?'timed':'select';$('duration').value=a.duration||6;components=structuredClone(parts(a)).map(c=>({...c,speed:c.speed??1}));selectedKind=components[0]?.kind||null;lookControls.setLook(a.appearance||defaultLook());checkpoint=JSON.stringify(draft());render();status(row?.builtin?'標準の演出です。変更した内容は別の演出として保存できます。':'');}
 async function preview(keepTime=false){const previous=previewId,id=crypto.randomUUID();previewId=id;previewSeen=false;try{await request('/api/avatar/sessions/'+sid+'/preview',{request_id:id,action:draft(),update_preview_id:keepTime?previous:null});status('');playing.textContent=$('behavior').value==='select'?'停止・切替まで表示':'プレビュー中';}catch(e){previewId=null;throw e;}}
 async function stopPreview(){cancelLive();if(!previewId)return;await request('/api/avatar/sessions/'+sid+'/preview/stop',{request_id:crypto.randomUUID(),expected_request_id:previewId});previewId=null;playing.textContent='停止しました';}
 add.onclick=()=>void work(async()=>{if(!canDiscard())return;await stopPreview();expanded.add('draft');load(null);$('name').focus();});
 del.onclick=()=>void work(async()=>{if(selected?.builtin)return;if(selected){if(!confirm('「'+selected.action.name+'」を削除しますか？'))return;await request('/api/avatar/presets/'+selected.id,{request_id:crypto.randomUUID().replaceAll('-',''),revision:selected.revision||0},'DELETE');}else if(!canDiscard())return;await stopPreview();await refresh();load(rows.find(r=>r.id==='0'.repeat(31)+'1'));status('演出を削除しました');});
 $('name').oninput=()=>renderList();$('behavior').onchange=()=>render();$('duration').oninput=()=>renderList();
 $('add').onclick=()=>void work(async()=>{const kind=$('kind').value;if(components.some(c=>c.kind===kind))return status('この要素は追加済みです');if(components.length>=10)return status('要素は10個までです');if(kind==='hide'){components=[{kind:'hide'}];selectedKind=kind;render();await preview();return;}if(components.some(c=>c.kind==='hide'))components=[];if(['ink','appear','dissolve','blocks'].includes(kind)&&components.some(c=>['ink','appear','dissolve','blocks'].includes(c.kind)))return status('登場・消滅はどれか1つを選んでください');components.push({kind,direction:kind==='glitch'?'right':'up',duration:kind==='bounce'?1:4,strength:kind==='expression'?1:.7,expression_index:0,speed:1});selectedKind=kind;render();await preview();});
 play.onclick=()=>{cancelLive();void work(preview);};stop.onclick=()=>void work(stopPreview);
 $('save').onclick=()=>void work(async()=>{if(!$('name').value.trim())throw Error('名前を入力してください');const body={request_id:crypto.randomUUID().replaceAll('-',''),action:draft()};let row;if(editing)row=await request('/api/avatar/presets/'+editing.id,{...body,revision:editing.revision||0},'PUT');else row=await request('/api/avatar/presets',body);editing=selected=row;expanded.add(row.id);checkpoint=JSON.stringify(body.action);await refresh();$('save').textContent='演出を保存';status('保存しました。配信準備の「ホットキー設定」で割り当てられます。');});
 let liveTimer=null;
 function cancelLive(){clearTimeout(liveTimer);liveTimer=null;}
 function live(){cancelLive();liveTimer=setTimeout(()=>{liveTimer=null;if(!online)return;if(busy){live();return;}void work(()=>preview(true));},120);}
 root.addEventListener('input',e=>{if(e.target.matches('input,select')&&!e.target.matches('[data-name],[data-kind],[data-upload]')){renderList();live();}});
 root.addEventListener('change',e=>{if(e.target.matches('select')&&!e.target.matches('[data-kind]'))live();});
 root.addEventListener('appearancechange',()=>{renderList();live();});
 load(null);void work(refresh);return{get dirty(){return dirty();},connection(v){online=v;buttons();},update(cue){if(cue?.request_id===previewId)previewSeen=true;if(previewId&&previewSeen&&cue?.request_id!==previewId){previewId=null;playing.textContent='終了しました';buttons();}},close(){cancelLive();root.remove();},draft};
}
