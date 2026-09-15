"""Local, append-only correction checkpoints, deferred inputs and raster donor conversion."""
from __future__ import annotations

import gzip
import hashlib
import io
import json
import threading
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Form
from fastapi.responses import FileResponse
from PIL import Image
from pydantic import BaseModel, ConfigDict, Field

router = APIRouter(prefix='/api/assist', tags=['Correction workflow'])
from .paths import DATA
ROOT = DATA/'assist'
LOCK = threading.RLock()
MAX_STATE = 48*1024**2


@router.get('/info')
def workflow_info():
    workspace=Path(__file__).resolve().parents[1]
    return dict(protocol=1,workspace=str(workspace),agent_guide='/api/assist/guide',
                cli=str(workspace/'tools'/'assist_agent.py'),image_generation='external_agent',
                limits=dict(edits_per_part=3,asset_requests=2,candidate_revisions=60,operation_receipts=200))


@router.get('/guide')
def agent_guide():
    return FileResponse(Path(__file__).resolve().parents[1]/'docs'/'ai-assist-agent-guide.md',media_type='text/plain; charset=utf-8')


def folder(kind, identifier):
    import re
    if not re.fullmatch(r'[a-f0-9-]{32,36}', identifier):
        raise HTTPException(422, 'Invalid identifier')
    return ROOT/kind/identifier


def read_latest(path):
    files = sorted(path.glob('*.json.gz'))
    if not files:
        raise HTTPException(404, '保存された依頼がありません')
    with gzip.open(files[-1], 'rb') as stream:
        raw = stream.read(MAX_STATE+1)
    if len(raw)>MAX_STATE:
        raise HTTPException(413, '保存データが大きすぎます')
    return json.loads(raw), int(files[-1].name.split('.')[0])


def append(path, body, expected):
    from .server import space_guard
    space_guard()
    raw = json.dumps(body, ensure_ascii=False, allow_nan=False).encode('utf-8')
    if len(raw)>MAX_STATE:
        raise HTTPException(413, '補正データは48MB以下にしてください')
    with LOCK:
        files = sorted(path.glob('*.json.gz'))
        current = int(files[-1].name.split('.')[0]) if files else 0
        if current != expected:
            raise HTTPException(409, '別の画面で更新されています。保存済み状態を再開してください')
        if current>=250:
            raise HTTPException(409, '履歴上限です。別保存して新しい依頼を作ってください')
        path.mkdir(parents=True, exist_ok=True)
        # The new revision becomes visible only when its complete gzip has been written.
        temporary = path/(uuid.uuid4().hex+'.tmp')
        with gzip.open(temporary, 'xb') as stream:
            stream.write(raw)
        temporary.rename(path/f'{current+1:06d}.json.gz')
        return current+1


@router.get('/sessions')
def sessions():
    result=[]
    base=ROOT/'sessions'
    if not base.exists():
        return result
    for path in sorted(base.iterdir(), key=lambda p:p.stat().st_mtime, reverse=True)[:100]:
        if not path.is_dir() or not list(path.glob('*.json.gz')):
            continue
        body, version=read_latest(path)
        summary=dict(body.get('summary',{}))
        targets=body.get('meta',{}).get('targets',[])
        parts=body.get('session',{}).get('base',{}).get('parts',[])
        roles={part.get('role') for part in parts if part.get('id') in targets}
        summary['steps']=[step for step,match in [('eyes',bool(roles & {'lash-l','lash-r'})),('mouth','mouth' in roles)] if match]
        result.append(dict(session_id=path.name,version=version,summary=summary))
    return result


@router.get('/sessions/{sid}')
def session(sid: str):
    body, version=read_latest(folder('sessions',sid))
    return dict(version=version,state=body)


@router.post('/sessions/{sid}')
async def save_session(sid: str, request: Request, expected_version: int=0):
    raw=bytearray()
    async for chunk in request.stream():
        raw.extend(chunk)
        if len(raw)>MAX_STATE:
            raise HTTPException(413,'補正データが大きすぎます')
    try:
        body=json.loads(raw)
        if body['session']['id']!=sid or not isinstance(body.get('receipts'),list):
            raise ValueError()
    except (ValueError,KeyError,TypeError):
        raise HTTPException(422,'補正セッション形式が不正です')
    return dict(version=append(folder('sessions',sid),body,expected_version))


def register_input(targets, options, donors, preferences=None, depth_index=None):
    identifier=uuid.uuid4().hex
    body=dict(paths=[str(p.relative_to(DATA)) for p in targets],
              options=options,donors=list(donors),preferences=preferences or {},job_id=None,depth_index=depth_index)
    append(folder('inputs',identifier),body,0)
    return dict(input_id=identifier,state='awaiting_agent')


@router.post('/inputs/{iid}/start')
def start_input(iid: str):
    from .server import DATA, start_job
    with LOCK:
        path=folder('inputs',iid);body,version=read_latest(path)
        if body['job_id']:
            return input_status(iid)
        targets=[DATA/value for value in body['paths']]
        def reserve(jid):
            body['job_id']=jid;append(path,body,version)
        depth_index=body.get('depth_index')
        result=start_job(targets[0],original=targets[1],face_donors=dict(zip(body['donors'],targets[2:2+len(body['donors'])])),before_start=reserve,depth_psd=targets[depth_index] if depth_index is not None else None,**body['options'])
        return dict(input_id=iid,**result,state='converting')


@router.get('/inputs/{iid}')
def input_status(iid: str):
    from .server import jobs, PROJECTS
    body,_=read_latest(folder('inputs',iid));jid=body['job_id']
    if not jid:
        return dict(input_id=iid,state='awaiting_agent',preferences=body.get('preferences',{}))
    if jid in jobs:
        return dict(input_id=iid,jobId=jid,preferences=body.get('preferences',{}),**jobs[jid])
    if (PROJECTS/jid/'project.json').exists():
        return dict(input_id=iid,jobId=jid,state='done',projectId=jid,preferences=body.get('preferences',{}))
    return dict(input_id=iid,jobId=jid,state='interrupted',message='変換中にサーバーが停止しました。素材を再登録してください')


class AssetRequest(BaseModel):
    model_config=ConfigDict(extra='forbid',allow_inf_nan=False)
    session_id: str = Field(pattern=r'^[a-f0-9-]{36}$')
    revision: int = Field(ge=0,le=60)
    part_id: str = Field(pattern=r'^p\d{3}$')
    width: int = Field(ge=1,le=4096)
    height: int = Field(ge=1,le=4096)
    source_hash: str = Field(pattern=r'^[a-f0-9]{64}$')
    reference_url: str = Field(pattern=r'^/api/exports/[a-f0-9]{32}/[a-zA-Z0-9_.-]+\.png$')


@router.post('/asset-requests')
def asset_request(body: AssetRequest):
    identifier=uuid.uuid4().hex
    append(folder('requests',identifier),body.model_dump(),0)
    return dict(request_id=identifier,**body.model_dump())


@router.post('/asset-requests/{rid}/import')
async def import_asset(rid: str,file: UploadFile=File(...),crop: str=Form(...),
                       extraction: str=Form('alpha'),placement_confirmed: bool=Form(False)):
    from .convert import trace_part
    from .server import space_guard
    if not placement_confirmed:
        raise HTTPException(422,'生成画像の切り抜き範囲と配置を確認してください')
    if extraction not in ('alpha','dark_ink'):
        raise HTTPException(422,'extraction must be alpha or dark_ink')
    spec,_=read_latest(folder('requests',rid))
    space_guard()
    payload=await file.read(20*1024**2+1)
    if len(payload)>20*1024**2:
        raise HTTPException(413,'PNGは20MB以下にしてください')
    try:
        image=Image.open(io.BytesIO(payload))
        if image.format!='PNG' or image.width*image.height>16_777_216:
            raise ValueError('PNG / 16MP limit')
        bounds=json.loads(crop)
        if not isinstance(bounds,list) or len(bounds)!=4 or any(type(v) is not int for v in bounds):
            raise ValueError('crop must be [left,top,right,bottom]')
        l,t,r,b=bounds
        if not 0<=l<r<=image.width or not 0<=t<b<=image.height:
            raise ValueError('crop outside image')
        part=image.convert('RGBA').crop(bounds)
        alpha=part.getchannel('A')
        if extraction=='alpha' and alpha.getextrema()[0]==255:
            raise ValueError('透明度がありません。閉じ形の線のみならdark_inkを明示してください')
        if extraction=='dark_ink':
            import numpy as np
            a=np.asarray(part).copy();lum=a[:,:,:3].astype(float).mean(axis=2)
            a[:,:,3]=(a[:,:,3].astype(float)*np.clip((210-lum)/100,0,1)).astype('uint8')
            part=Image.fromarray(a)
        if not part.getchannel('A').getbbox():
            raise ValueError('切り抜きが空です')
        part=part.resize((spec['width'],spec['height']),Image.Resampling.LANCZOS)
    except (ValueError,OSError,Image.DecompressionBombError) as exc:
        raise HTTPException(422,str(exc))
    aid=uuid.uuid4().hex;dest=folder('assets',aid);dest.mkdir(parents=True)
    (dest/'source.png').write_bytes(payload);part.save(dest/'part.png')
    from starlette.concurrency import run_in_threadpool
    (dest/'work').mkdir();(dest/'parts').mkdir()
    svg,paths=await run_in_threadpool(trace_part,part,dest/'work','donor','detail')
    (dest/'part.svg').write_text(svg,encoding='utf-8')
    meta=dict(asset_id=aid,request_id=rid,**spec,crop=bounds,extraction=extraction,paths=paths,
              image_hash=hashlib.sha256(payload).hexdigest(),image_size=[image.width,image.height],
              output_to_part=[spec['width']/(r-l),0,0,spec['height']/(b-t),-l*spec['width']/(r-l),-t*spec['height']/(b-t)],
              svg_hash=hashlib.sha256(svg.encode()).hexdigest(),preview_url=f'/api/assist/assets/{aid}/preview')
    append(dest,meta,0)
    return meta


@router.get('/assets/{aid}')
def asset(aid: str):
    path=folder('assets',aid);meta,_=read_latest(path)
    return dict(**meta,svg=(path/'part.svg').read_text(encoding='utf-8'))


@router.get('/assets/{aid}/preview')
def asset_preview(aid: str):
    path=folder('assets',aid)/'part.png'
    if not path.exists():raise HTTPException(404)
    return FileResponse(path,media_type='image/png')
