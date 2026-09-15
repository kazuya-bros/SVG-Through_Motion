import {createCorrectionSession,editableParts} from './edit-commands.js';
import {renderCorrectionReview,renderAssetReference,renderCorrectionPreview} from './review-renderer.js';
import {zipFiles,sanitizeSvg} from './assets.js';
import {motionFields,motionValues} from './assist-motion.js';

export async function sha256(text){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(n=>n.toString(16).padStart(2,'0')).join('');}
function commandSignature(command){
  const copy={...command};if(copy.request_ai===false)delete copy.request_ai;
  const ordered=value=>Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,ordered(value[k])])):value;
  return JSON.stringify(ordered(copy));
}
export function createAssistController(api){
  let session=null,busy=false,review=null,storageVersion=0,meta={};
  const receipts=new Map();
  const info=()=>session?{...session.inspect(),workflow:meta,storage_version:storageVersion,...(meta.mode==='from_inputs'?{motion:{values:motionValues(session.candidate().settings),fields:motionFields}}:{})}:null;
  const pack=()=>({session:session.serialize(),meta,review:review?{revision:review.revision,saved:review.saved}:null,receipts:[...receipts],summary:{name:session.base().name,project_id:session.base().id,status:meta.status||'editing',revision:session.inspect().revision}});
  function unpack(state){session=createCorrectionSession(state.session.base,state.session.id,state.session);meta=state.meta||{};review=state.review;receipts.clear();for(const [k,v]of state.receipts||[])receipts.set(k,v);}
  async function persist(){if(api.store&&session){const result=await api.store(session.inspect().session_id,storageVersion,pack());storageVersion=result.version;}}
  return async function execute(cmd){
    if(cmd.operation==='review'&&!cmd.operation_id)cmd={...cmd,operation_id:crypto.randomUUID()};
    if(busy)throw Error('補正処理の完了を待ってください');
    const mutation=!['inspect','list','resume','save','preview'].includes(cmd.operation);
    if(mutation&&!cmd.operation_id)throw Error('operation_idが必要です');
    const signature=commandSignature(cmd);
    if(mutation&&receipts.has(cmd.operation_id)){
      const saved=receipts.get(cmd.operation_id);if(commandSignature(JSON.parse(saved.signature))!==signature)throw Error('同じoperation_idに異なる内容は指定できません');return structuredClone(saved.result);
    }
    if(mutation&&cmd.operation!=='start'&&receipts.size>=200)throw Error('操作履歴上限です。別保存して新しい候補を開始してください');
    busy=true;const backup=session?structuredClone(pack()):null,oldVersion=storageVersion;let liveBackup=null;
    try{
      let result;
      if(cmd.operation==='list')result=await api.list();
      else if(cmd.operation==='resume'){
        const saved=await api.load(cmd.session_id);
        api.validateState?.(saved.state);unpack(saved.state);storageVersion=saved.version;
        result=info();
      }else if(cmd.operation==='inspect'){
        const p=await api.snapshot();result={live:p?{project_id:p.id,width:p.width,height:p.height,parts:editableParts(p)}:null,session:info()};
      }else if(cmd.operation==='start'){
        if(session?.inspect().active)throw Error('現在の候補を採用または終了してから開始してください');
        const source=await api.snapshot();if(!source)throw Error('先に素材を読み込んでください');
        const scope=cmd.targets||editableParts(source).map(p=>p.id);
        if(!scope.length||scope.some(id=>!editableParts(source).some(p=>p.id===id)))throw Error('補正対象の目・口を選んでください');
        session=createCorrectionSession(source,crypto.randomUUID());review=null;storageVersion=0;receipts.clear();
        meta={status:cmd.request_ai||cmd.mode==='from_inputs'?'awaiting_agent':'editing',mode:cmd.mode||'finish',wish:cmd.wish||(cmd.mode==='from_inputs'?'絵柄を保ち、目・口を整えて自然で控えめな待機の動きをつける':'絵柄を保ち、閉じ目と閉じ口を自然に整える'),targets:scope,allow_generation:!!cmd.allow_generation,edits:{},requests:[],assessment:null};
        meta.auto_apply=!!cmd.auto_apply||cmd.mode==='from_inputs';
        result=info();
      }else{
        if(!session||cmd.session_id!==session.inspect().session_id)throw Error('補正session_idが一致しません');
        const requireActive=()=>{if(!session.inspect().active)throw Error('この補正候補は終了しています');};
        const requireRevision=()=>{if(cmd.revision!==session.inspect().revision)throw Error('候補revisionが一致しません');};
        const requireTarget=()=>{if(!meta.targets.includes(cmd.part_id))throw Error('依頼の対象外です');};
        if(cmd.operation==='preview'){
          requireRevision();result=await renderCorrectionPreview(session.base(),session.candidate(),meta.targets);
        }else if(cmd.operation==='claim'){
          requireActive();if(!cmd.capabilities?.inspect_images||!cmd.capabilities?.edit_project)throw Error('画像確認と編集操作が必要です');
          meta.capabilities=cmd.capabilities;meta.status='reviewing';result=info();
        }else if(cmd.operation==='edit'){
          requireTarget();if((meta.edits[cmd.part_id]||0)>=3)throw Error('この部位の補正は3回までです。最良候補を選んで終了してください');
          session.edit(cmd.revision,cmd.part_id,cmd.values);meta.edits[cmd.part_id]=(meta.edits[cmd.part_id]||0)+1;review=null;meta.assessment=null;meta.status='reviewing';result=info();
        }else if(cmd.operation==='motion'){
          if(meta.mode!=='from_inputs')throw Error('動きの調整は「最初からAIに任せる」の依頼だけで使えます');
          if((meta.motion_edits||0)>=6)throw Error('動きの調整は6回までです。最良候補を選んでください');
          session.motion(cmd.revision,cmd.settings);meta.motion_edits=(meta.motion_edits||0)+1;review=null;meta.assessment=null;meta.status='reviewing';result=info();
        }else if(cmd.operation==='restore'){
          session.restore(cmd.revision,cmd.target_revision);review=null;meta.assessment=null;meta.status='reviewing';result=info();
        }else if(cmd.operation==='review'){
          requireRevision();
          const rendered=await renderCorrectionReview(session.base(),session.candidate());
          const files=[];for(const p of rendered.pages)files.push([p.name,new Uint8Array(await p.blob.arrayBuffer())]);
          files.push(['review.json',JSON.stringify({...rendered.manifest,session_id:cmd.session_id,revision:cmd.revision})]);
          const saved=await api.download(zipFiles(files),'correction-review.zip','application/zip');
          review={revision:cmd.revision,saved};result={...saved,revision:cmd.revision,manifest:rendered.manifest};
          api.showReview?.(rendered.pages);
        }else if(cmd.operation==='prepare_asset'){
          requireActive();requireRevision();requireTarget();
          if(!meta.allow_generation||!meta.capabilities?.generate_images)throw Error('画像生成の利用が有効ではありません');
          if(meta.requests.length>=2)throw Error('画像生成は1依頼につき2回までです');
          const p=session.candidate(),part=p.parts.find(p=>p.id===cmd.part_id),ref=await renderAssetReference(p);
          const saved=await api.download(ref.blob,'correction-reference.png','image/png');
          const spec=await api.prepareAsset({session_id:cmd.session_id,revision:cmd.revision,part_id:part.id,width:part.width,height:part.height,source_hash:await sha256(part.closedSvgText),reference_url:saved.url});
          meta.requests.push(spec);meta.status='waiting_asset';
          result={...spec,reference:saved,reference_size:[ref.width,ref.height],part_bounds:{x:part.x,y:part.y,width:part.width,height:part.height},canvas_size:[p.width,p.height],instruction:'参照画像の絵柄を保って対象の閉じ形を作成。結果を確認して線だけの範囲をcropで指定し、importへPNGを送信してください。'};
        }else if(cmd.operation==='attach_asset'){
          requireActive();requireRevision();
          const asset=await api.asset(cmd.asset_id),spec=meta.requests.find(r=>r.request_id===asset.request_id);
          if(!spec||asset.session_id!==cmd.session_id||asset.revision!==cmd.revision||spec.part_id!==asset.part_id||asset.source_hash!==spec.source_hash)throw Error('生成依頼と候補が一致しません。古い素材は適用しません');
          const p=session.candidate().parts.find(p=>p.id===asset.part_id);
          if(await sha256(p.closedSvgText)!==asset.source_hash||await sha256(asset.svg)!==asset.svg_hash)throw Error('生成元または素材が変わっています');
          session.replace(cmd.revision,p.id,sanitizeSvg(asset.svg,'assist-'+asset.asset_id+'-'));review=null;meta.assessment=null;meta.status='reviewing';result=info();
        }else if(cmd.operation==='finish'){
          requireActive();requireRevision();if(review?.revision!==cmd.revision)throw Error('最新候補の比較画像が必要です');
          if(meta.mode==='from_inputs'&&(!meta.motion_edits||!cmd.assessment?.evidence?.some(n=>/^review-(09|1[0-6])\.png$/.test(n))))throw Error('動きを選んでmotionで設定し、最新のモーション比較を確認してください');
          if(!cmd.assessment?.notes?.trim()||!Array.isArray(cmd.assessment.evidence)||!cmd.assessment.evidence.length||cmd.assessment.evidence.some(n=>!/^review-(0\d|1[0-6])\.png$/.test(n)))throw Error('確認所見と比較画像名が必要です');
          meta.assessment={...cmd.assessment,review:review.saved,revision:cmd.revision};meta.status='ready_for_review';result=info();
          if(meta.auto_apply){
            const live=await api.snapshot();let candidate;
            // A later manual edit wins. Preserve the finished candidate for separate saving.
            try{candidate=session.apply(cmd.revision,live);}catch(error){meta.apply_error=error.message;}
            if(candidate){liveBackup=live;await api.adopt(candidate);session.applied(await api.snapshot());meta.status='applied';delete meta.apply_error;}
            result=info();
          }
        }else if(cmd.operation==='apply'){
          if(review?.revision!==cmd.revision)throw Error('現在の候補を比較描画してから適用してください');
          if(meta.capabilities&&meta.assessment?.revision!==cmd.revision)throw Error('AIの確認所見をfinishに記録してください');
          liveBackup=await api.snapshot();const candidate=session.apply(cmd.revision,liveBackup);
          await api.adopt(candidate);session.applied(await api.snapshot());meta.status='applied';result=info();
        }else if(cmd.operation==='undo'){
          liveBackup=await api.snapshot();await api.adopt(session.undo(liveBackup));session.undone();meta.status='undone';result=info();
        }else if(cmd.operation==='cancel'){session.cancel();meta.status='cancelled';result=info();}
        else if(cmd.operation==='save'){requireRevision();result=await api.saveCandidate(session.candidate());}
        else throw Error('未対応の補正操作です');
      }
      if(mutation){receipts.set(cmd.operation_id,{signature,result:structuredClone(result)});await persist();}
      if(cmd.operation!=='preview')api.updated?.(info(),cmd.operation);return result;
    }catch(error){
      if(liveBackup)await api.adopt(liveBackup);
      if(backup)unpack(backup);else{session=null;receipts.clear();meta={};review=null;}
      storageVersion=oldVersion;throw error;
    }finally{busy=false;}
  };
}
