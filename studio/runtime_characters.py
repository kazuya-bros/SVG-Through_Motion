"""A bounded character roster on one output URL, shared by UI/API/hotkeys."""
import asyncio
import copy
import hashlib
import json
import time
import uuid
from collections import OrderedDict
from fastapi import APIRouter, HTTPException
from pydantic import Field
from .performance import Strict
from .runtime import get

router=APIRouter(prefix='/api/runtime',tags=['Output characters'])
tasks=set()

def roster(s):
    from .avatar_actions import listing
    return [dict(id=k,name=p.get('name','キャラクター'),active=k==s.character_id,
                 actions=[dict(id=a['id'],name=a['action']['name']) for a in listing(p.get('id',''))]) for k,p in s.characters.items()]

@router.get('/sessions/{sid}/characters')
def listing(sid: str):
    s=get(sid)
    return dict(active=s.character_id,characters=roster(s))

class Add(Strict):
    project: dict
    label: str | None = Field(None,min_length=1,max_length=100)

@router.post('/sessions/{sid}/characters',status_code=201)
async def add(sid: str,body: Add):
    s=get(sid);p=copy.deepcopy(body.project)
    if body.label:p["name"]=body.label
    if not isinstance(p.get('parts'),list) or not p['parts'] or not all(isinstance(p.get(k),(int,float)) and 0<p[k]<=16384 for k in ('width','height')):
        raise HTTPException(422,'有効なキャラクタープロジェクトを選んでください')
    size=len(json.dumps(p,ensure_ascii=False).encode())
    if size>100*1024**2:raise HTTPException(413,'キャラクターは100MB以下にしてください')
    identity=hashlib.sha256(json.dumps(p,sort_keys=True,ensure_ascii=False).encode()).hexdigest()[:32]
    async with s.lock:
        existing=next((k for k,v in s.characters.items() if v==p),None)
        if existing:return dict(**listing(sid),added_id=existing)
        if len(s.characters)>=8:raise HTTPException(409,'キャラクターは8体までです')
        if sum(len(json.dumps(v,ensure_ascii=False).encode()) for v in s.characters.values())+size>250*1024**2:raise HTTPException(413,'キャラクターの合計は250MB以下にしてください')
        s.characters[identity]=copy.deepcopy(p)
    return dict(**listing(sid),added_id=identity)

@router.get('/sessions/{sid}/characters/{identity}/project')
def project(sid: str,identity: str):
    s=get(sid)
    if identity not in s.characters:raise HTTPException(404,'登録したキャラクターがありません')
    return s.characters[identity]

class Switch(Strict):
    request_id: str = Field(min_length=1,max_length=64,pattern=r'^[\w-]+$')
    character_id: str = Field(min_length=1,max_length=100)
    preset_id: str = Field(default='0'*31+'1',pattern=r'^[a-f0-9]{32}$')

@router.post('/sessions/{sid}/characters/switch',status_code=202)
async def switch(sid: str,body: Switch):
    from .avatar_actions import load,bundle
    from .performance import check_assets,Scene
    s=get(sid)
    async with s.lock:
        if not hasattr(s,'character_requests'):s.character_requests=OrderedDict()
        if body.request_id in s.character_requests:
            row=s.character_requests[body.request_id]
            if row['command']!=body.model_dump():raise HTTPException(409,'同じIDで異なる切り替えはできません')
            return {k:v for k,v in row.items() if k!='future'}
        if not s.status()['connected']:raise HTTPException(409,'配信画面を開いてください')
        if body.character_id not in s.characters:raise HTTPException(404,'キャラクターを配信準備で追加してください')
        action=load(body.preset_id);p=s.characters[body.character_id]
        if action.project_id and action.project_id!=p.get('id'):raise HTTPException(422,'選んだキャラクター用の演出を指定してください')
        if action.kind=='bundle':
            recipe=bundle(action);check_assets([Scene(appearance=recipe.appearance)])
            count=len(p.get('expressionPresets',[])) if isinstance(p.get('expressionPresets'),list) else 5
            if any(c.kind=='expression' and c.expression_index>=count for c in recipe.components):raise HTTPException(422,'このキャラクターにない表情です')
        for row in s.character_requests.values():
            if row['status']=='loading':
                row['status']='interrupted'
                if not row['future'].done():row['future'].set_result(False)
        row=dict(request_id=body.request_id,command=body.model_dump(),status='loading',error=None,created=time.time(),future=asyncio.get_running_loop().create_future())
        s.character_requests[body.request_id]=row
        while len(s.character_requests)>100:s.character_requests.popitem(last=False)
        task=asyncio.create_task(perform(s,body,row));tasks.add(task);task.add_done_callback(tasks.discard)
        return {k:v for k,v in row.items() if k!='future'}

async def perform(s,body,row):
    from . import performance
    from .avatar_actions import trigger,Trigger
    try:
        await s.send(dict(type='character',character_id=body.character_id,request_id=body.request_id))
        if not await asyncio.wait_for(asyncio.shield(row['future']),60):return
        async with s.lock:
            if row['status']!='loading':return
            s.project=s.characters[body.character_id];s.character_id=body.character_id;s.effect=s.pose=s.expression=None
            performance.reset(s);performance.initialize(s)
            await s.changed()
        effect=await trigger(s.id,Trigger(request_id=body.request_id+'-effect',preset_id=body.preset_id))
        row.update(status='completed',effect_result_url=effect.get('result_url'))
    except Exception as e:
        if row['status']=='loading':row.update(status='failed',error=str(getattr(e,'detail',None) or e) or 'キャラクターの準備が完了しませんでした')

def acknowledge(s,message):
    row=getattr(s,'character_requests',{}).get(message.get('request_id'))
    if not row or row['status']!='loading' or row['future'].done():return
    if message.get('error'):
        row.update(status='failed',error=str(message['error'])[:500]);row['future'].set_result(False)
    elif message.get('character_id')==row['command']['character_id']:row['future'].set_result(True)

@router.get('/sessions/{sid}/characters/result/{request_id}')
def result(sid: str,request_id: str):
    row=getattr(get(sid),'character_requests',{}).get(request_id)
    if not row:raise HTTPException(404,'切り替えの結果がありません')
    return {k:v for k,v in row.items() if k!='future'}
