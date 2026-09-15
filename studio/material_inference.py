"""See-Through jobs use PachiPakuGen's prepared, pinned runtime without patching it."""
import hashlib
import json
import os
import subprocess
import threading
import uuid
from pathlib import Path
from typing import Literal

import numpy as np
from fastapi import APIRouter, HTTPException
from PIL import Image
from psd_tools import PSDImage
from psd_tools.api.layers import PixelLayer
from pydantic import BaseModel, ConfigDict, Field

from . import materials as m

router=APIRouter(prefix='/api/material-inference',tags=['分割・奥行き生成'])
JOBS={}; guard=threading.Lock()
PIN='e4cb250dc69defe6f982168dab684aa461552b5b'
CANDIDATE_ORDER=['back hair','wings','tail','footwear','legwear','bottomwear','neck','topwear','handwear','neckwear','ears','face','nose','eyewhite','irides','eyebrow','eyelash','mouth','earwear','front hair','eyewear','headwear','objects']


def runtime_root():
    configured=os.environ.get('SVG_THROUGH_SEE_THROUGH_ROOT') or os.environ.get('PACHIPAKUGEN_SEE_THROUGH_ROOT')
    if configured:
        return Path(configured)
    config=Path(os.environ.get('APPDATA',''))/'com.kazuya.pachipakugen'/'see-through-location.json'
    if config.is_file():
        value=json.loads(config.read_text(encoding='utf-8')).get('runtimeRoot')
        if value:
            return Path(value)
    return Path(os.environ.get('LOCALAPPDATA',''))/'com.kazuya.pachipakugen'/'see-through'


def runtime():
    root=runtime_root();python=root/'.venv'/'Scripts'/'python.exe';repo=root/'repo'
    marker=root/'setup-complete.json';manifest=root/'model-manifests'/'standard.json'
    if not python.is_file() or not marker.is_file() or not manifest.is_file():
        raise ValueError('See-Through環境が未準備です。PachiPakuGenで準備済みの環境を指定してください。')
    if json.loads(marker.read_text(encoding='utf-8')).get('commit')!=PIN:
        raise ValueError('See-Throughの対応リビジョンが一致しません。既存環境は変更していません。')
    models=json.loads(manifest.read_text(encoding='utf-8'))
    for file in models['files']:
        path=(root/'huggingface'/file['path']).resolve()
        if not path.is_relative_to((root/'huggingface').resolve()) or not path.is_file() or path.stat().st_size!=file['size']:
            raise ValueError('See-Throughモデルが不足しています。PachiPakuGenのモデル準備を確認してください。')
    return root,python,repo,models


def signature(state):
    # Names and locks don't affect depth. Geometry, order, ownership and pixels do.
    keys=['id','asset','tag','x','y','scale','opacity','visible','parent','repair','crop']
    values=[{k:p.get(k) for k in keys} for p in state['layers'] if p.get('visible')]
    return hashlib.sha256(json.dumps(values,sort_keys=True).encode()).hexdigest()


def depth_tag(tag):
    if tag.startswith('closed-') or tag=='mouth-closed':return None
    for prefix,base in [('white-','eyewhite'),('iris-','irides'),('lash-','eyelash'),('brow-','eyebrow'),('ear-','ears'),('handwear-','handwear')]:
        if tag.startswith(prefix):return base
    return 'objects' if tag=='static' else tag


def prepare_depth(path,state,dest):
    groups={};mapping={};canvas=Image.new('RGBA',(state['width'],state['height']))
    for part,im in m.materialized(path,state):
        tag=depth_tag(part['tag'])
        if tag is None:continue
        canvas.alpha_composite(im)
        groups.setdefault(tag,Image.new('RGBA',canvas.size)).alpha_composite(im)
        mapping[part['id']]=tag
    dest.mkdir(parents=True,exist_ok=True)
    canvas.save(dest/'src_img.png')
    for tag,im in groups.items():im.save(dest/(tag+'.png'))
    return groups,mapping


def collect_depth(groups,mapping,dest,state):
    from .depth import read_depth
    base=PSDImage.new('RGBA',(state['width'],state['height']))
    depth=PSDImage.new('L',(state['width'],state['height']))
    values={}
    for tag,im in groups.items():
        filename=dest/(tag+'_depth.png')
        if not filename.is_file():continue
        field=Image.open(filename).convert('L')
        if field.size!=im.size:field=field.resize(im.size,Image.Resampling.BILINEAR)
        mask=np.asarray(im.getchannel('A'))>127
        if not mask.any():continue
        median=float(np.median(np.asarray(field)[mask]))/255
        values[tag]=median
        PixelLayer.frompil(im,base,name=tag)
        PixelLayer.frompil(field,depth,name=tag)
    bp=dest/'prepared.psd';dp=dest/'prepared_depth.psd';base.save(bp);depth.save(dp)
    data=read_depth(dp,base)
    return dict(signature=signature(state),field=data['field'],partValues={pid:values[tag] for pid,tag in mapping.items() if tag in values},source='see-through-marigold',revision=state['revision'])


class Run(BaseModel):
    model_config=ConfigDict(extra='forbid')
    material_id: str=Field(pattern=r'^[a-f0-9]{32}$')
    revision: int=Field(ge=0)
    operation: Literal['split','depth']='split'
    seed: int=Field(42,ge=0,le=2147483647)
    resolution: int=Field(768,ge=512,le=1536)
    steps: int=Field(30,ge=1,le=60)


@router.get('/status')
def status():
    try:
        root,*_=runtime()
        return dict(ready=True,root=str(root),revision=PIN,activeJobs=[dict(id=j['id'],material_id=j['material_id']) for j in JOBS.values() if j['state'] in ('queued','running')])
    except (ValueError,OSError,KeyError) as e:
        return dict(ready=False,message=str(e))


@router.get('/jobs/{jid}')
def job(jid:str):
    if jid not in JOBS:raise HTTPException(404,'生成処理が見つかりません')
    return {k:v for k,v in JOBS[jid].items() if k!='process'}


@router.post('/jobs/{jid}/cancel')
def cancel(jid:str):
    if jid not in JOBS:raise HTTPException(404,'生成処理が見つかりません')
    with guard:
        value=JOBS[jid]
        if value['state'] in ('queued','running'):
            value['cancelled']=True
            process=value.get('process')
            if process and process.poll() is None:process.terminate()
    return dict(ok=True)


@router.post('/jobs')
def start(body:Run):
    from .server import space_guard
    try:root,python,repo,models=runtime()
    except (ValueError,OSError,KeyError) as e:raise HTTPException(422,str(e)) from e
    state=m.read(body.material_id);path=m.folder(body.material_id)
    if body.revision!=state['revision']:raise HTTPException(409,'素材を保存し直してください')
    if body.operation=='depth' and not any(p['tag']=='face' and p['visible'] for p in state['layers']):
        raise HTTPException(422,'奥行き生成には「顔」の役割を持つパーツが必要です')
    space_guard()
    with guard:
        if any(j['state'] in ('queued','running') for j in JOBS.values()):raise HTTPException(409,'See-Throughの処理中です')
        jid=uuid.uuid4().hex;JOBS[jid]=dict(id=jid,state='queued',message='生成の準備中',material_id=state['id'],cancelled=False)
    dest=path/'inference'/jid;dest.mkdir(parents=True)
    def work():
        item=JOBS[jid];item['state']='running'
        try:
            groups=mapping=None
            if body.operation=='depth':
                groups,mapping=prepare_depth(path,state,dest/'source')
                source=dest/'source.png'
            else:
                # The base image is retained independently of later candidate selection.
                originals=sorted(path.glob('input-*'))
                source=dest/'source.png'
                first=path/state['sourceAsset'] if state.get('sourceAsset') else min(originals,key=lambda p:p.stat().st_mtime)
                im=PSDImage.open(first).composite(force=True) if first.suffix.lower()=='.psd' else m.checked_image(first)
                im.save(source)
            config=dict(repo=str(repo),source=str(source),output=str(dest),operation=body.operation,
                        seed=body.seed,resolution=body.resolution,steps=body.steps,models={})
            for name,rev in models['revisions'].items():
                config['models'][name]=str(root/'huggingface'/'hub'/('models--'+name.replace('/','--'))/'snapshots'/rev)
            config_path=dest/'job.json';config_path.write_text(json.dumps(config),encoding='utf-8')
            env=os.environ.copy();env.update(HF_HOME=str(root/'huggingface'),HF_HUB_OFFLINE='1',TRANSFORMERS_OFFLINE='1',PYTHONUTF8='1',PYTHONUNBUFFERED='1',PYTHONDONTWRITEBYTECODE='1')
            env['PYTHONPATH']=os.pathsep.join([str(repo),str(repo/'common'),str(repo/'inference')])
            with (dest/'run.log').open('w',encoding='utf-8') as log:
                process=subprocess.Popen([str(python),str(m.ROOT/'tools'/'material_inference_worker.py'),str(config_path)],cwd=repo,env=env,stdout=log,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
                with guard:
                    item['process']=process
                    if item['cancelled']:process.terminate()
                item['message']='See-Throughで分割しています…' if body.operation=='split' else '補正済みパーツから奥行きを推定しています…'
                code=process.wait(timeout=1800)
            if item['cancelled']:item.update(state='cancelled',message='生成を中止しました。採用済み素材は保持しています。');return
            if code:raise ValueError('See-Throughの実行に失敗しました。作業フォルダのrun.logで詳細を確認できます。')
            with m.mutex:
                current=m.read(state['id'])
                if current['revision']!=state['revision']:
                    raise ValueError('生成中に素材が更新されました。結果は保存していますが、自動適用しません。')
                if body.operation=='depth':
                    current['depth']=collect_depth(groups,mapping,dest/'source',state)
                else:
                    before=len(current['layers'])
                    for file in sorted((dest/'source').glob('*.png'),key=lambda f:CANDIDATE_ORDER.index(f.stem) if f.stem in CANDIDATE_ORDER else 100):
                        if file.stem in ('src_img','src_head','reconstruction','head') or file.stem.endswith('_depth'):continue
                        image=m.checked_image(file)
                        if image.size != (state['width'],state['height']):
                            # apply_layerdiff stores a square padded inference canvas.
                            size=max(state['width'],state['height']);image=image.resize((size,size),Image.Resampling.LANCZOS)
                            left=(size-state['width'])//2;top=(size-state['height'])//2
                            image=image.crop((left,top,left+state['width'],top+state['height']))
                        paired={**m.SIDES,'ears':'ear','handwear':'handwear'}.get(file.stem)
                        if paired:
                            cut=state['width']//2
                            for side,box in [('l',(0,0,cut,state['height'])),('r',(cut,0,state['width'],state['height']))]:
                                m.add_image(path,current,image.crop(box),file.stem+'-'+side,paired+'-'+side,box[0],0,False)
                        else:
                            m.add_image(path,current,image,file.stem,m.infer_tag(file.stem),visible=False)
                    ids=[p['id'] for p in current['layers'][before:]]
                    if not ids:raise ValueError('分割パーツが生成されませんでした')
                    current.setdefault('candidates',[]).append(dict(id=jid,seed=body.seed,parts=ids))
                current['revision']+=1
                current['depthCurrent']=bool(current.get('depth') and current['depth']['signature']==signature(current))
                m.persist(path,current)
            item.update(state='done',message='分割候補を追加しました。' if body.operation=='split' else '奥行きを生成しました。')
        except Exception as e:
            process=item.get('process')
            if process and process.poll() is None:process.terminate()
            item.update(state='error',message=str(e))
        finally:item.pop('process',None)
    threading.Thread(target=work,daemon=True).start()
    return dict(jobId=jid)
