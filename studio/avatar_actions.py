"""Saved avatar actions shared by buttons, native hotkeys and the public API."""
import asyncio
import json
import re
import time
from collections import OrderedDict
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import Field, model_validator, ValidationError
from .paths import DATA
from .performance import Strict, Appearance, Scene
from . import performance, runtime_effects
from .avatar_recipe import Bundle, Component

router = APIRouter(prefix='/api/avatar', tags=['Avatar actions'])
STORE = DATA / 'avatar-actions'
lock = asyncio.Lock()
timers = set()
KINDS = ['glitch','blocks','ink','dissolve','appear','comms','happy','bounce','blush','sweat','gloom','image','outline','light','colors','reset']


class Action(Strict):
    name: str = Field(min_length=1, max_length=60)
    project_id: str = Field('', max_length=100)
    kind: Literal['glitch','blocks','ink','dissolve','appear','comms','happy','bounce','blush','sweat','gloom','image','outline','light','colors','reset','bundle']
    components: list[Component] = Field(default_factory=list,max_length=10)
    visibility: bool = True
    direction: Literal['left','right','up','down'] = 'up'
    duration: float = Field(4, ge=.5, le=30)
    strength: float = Field(.7, ge=0, le=1)
    behavior: Literal['toggle','timed','select'] = 'toggle'
    appearance: Appearance = Field(default_factory=Appearance)

    @model_validator(mode='after')
    def usable(self):
        if not self.name.strip():raise ValueError('演出の名前を入力してください')
        if self.kind=='image' and not self.appearance.emotion_asset_id:raise ValueError('感情画像を選んでください')
        if self.kind=='bundle':bundle(self)
        return self


class Save(Strict):
    request_id: str = Field(pattern=r'^[a-f0-9]{32}$')
    action: Action


class Trigger(Strict):
    request_id: str = Field(min_length=1, max_length=80, pattern=r'^[\w-]+$')
    preset_id: str = Field(pattern=r'^[a-f0-9]{32}$')


def bundle(action,preview=False):
    return Bundle(components=action.components,appearance=action.appearance,visibility=action.visibility,behavior='timed' if action.behavior=='timed' else 'select')


def builtins():
    return [dict(id='0'*32,created=0,builtin=True,action=Action(name='0：消える',kind='bundle',visibility=False,behavior='select').model_dump()),
            dict(id='0'*31+'1',created=0,builtin=True,action=Action(name='1：通常表示',kind='bundle',behavior='select').model_dump())]


def listing(project_id=None):
    if not STORE.exists(): return builtins()
    rows=[]
    for file in STORE.glob('*.json'):
        row=json.loads(file.read_text(encoding='utf-8'))
        if row.get('deleted'):continue
        if project_id is None or row['action']['project_id'] in ('',project_id):rows.append(row)
    return builtins()+sorted(rows,key=lambda row:row['created'],reverse=True)


@router.get('/presets')
def presets(project_id: str | None = None):
    return listing(project_id)


@router.post('/presets', status_code=201)
async def save(body: Save):
    async with lock:
        if body.request_id in ('0'*32,'0'*31+'1'):raise HTTPException(409,'標準の演出は上書きできません')
        STORE.mkdir(parents=True,exist_ok=True)
        path=STORE/(body.request_id+'.json')
        if path.exists():
            row=json.loads(path.read_text(encoding='utf-8'))
            if row.get('deleted'):raise HTTPException(409,'削除した演出のIDは再利用できません')
            if Action.model_validate(row['action']).model_dump() != body.action.model_dump():raise HTTPException(409,'同じIDで異なる設定を保存できません')
            return row
        if len(listing())-len(builtins()) >= 256:raise HTTPException(409,'演出設定は256件までです')
        row=dict(id=body.request_id,action=body.action.model_dump(),created=time.time(),revision=0)
        temporary=path.with_suffix('.tmp');temporary.write_text(json.dumps(row,ensure_ascii=False),encoding='utf-8');temporary.replace(path)
        return row


class Update(Save):
    revision: int = Field(ge=0)


@router.put('/presets/{identity}')
async def update(identity: str,body: Update):
    async with lock:
        if identity in ('0'*32,'0'*31+'1'):raise HTTPException(409,'標準の演出は別名で保存してください')
        load(identity);path=STORE/(identity+'.json');row=json.loads(path.read_text(encoding='utf-8'))
        if row.get('last_request_id')==body.request_id:
            if row['action']!=body.action.model_dump():raise HTTPException(409,'同じIDの更新内容が違います')
            return row
        if row.get('revision',0)!=body.revision:raise HTTPException(409,'演出が更新されています。読み直してください')
        row.update(action=body.action.model_dump(),revision=body.revision+1,last_request_id=body.request_id)
        temporary=path.with_suffix('.tmp');temporary.write_text(json.dumps(row,ensure_ascii=False),encoding='utf-8');temporary.replace(path)
        return row


class Delete(Strict):
    request_id: str = Field(pattern=r'^[a-f0-9]{32}$')
    revision: int = Field(ge=0)


@router.delete('/presets/{identity}')
async def delete(identity: str, body: Delete):
    async with lock:
        if identity in ('0'*32,'0'*31+'1'):raise HTTPException(409,'標準の演出は削除できません')
        if not re.fullmatch('[a-f0-9]{32}',identity):raise HTTPException(404,'演出が見つかりません')
        path=STORE/(identity+'.json')
        if not path.is_file():raise HTTPException(404,'演出が見つかりません')
        row=json.loads(path.read_text(encoding='utf-8'))
        if row.get('deleted'):
            if row.get('delete_request_id')==body.request_id:return dict(id=identity,deleted=True)
            raise HTTPException(404,'この演出は削除されています')
        if row.get('revision',0)!=body.revision:raise HTTPException(409,'演出が更新されています。読み直してください')
        row.update(deleted=True,delete_request_id=body.request_id,revision=body.revision+1)
        temporary=path.with_suffix('.tmp');temporary.write_text(json.dumps(row,ensure_ascii=False),encoding='utf-8');temporary.replace(path)
        return dict(id=identity,deleted=True)


def load(identity):
    for item in builtins():
        if item['id']==identity:return Action.model_validate(item['action'])
    if not re.fullmatch('[a-f0-9]{32}',identity) or not (STORE/(identity+'.json')).is_file():
        raise HTTPException(404,'登録した演出が見つかりません')
    row=json.loads((STORE/(identity+'.json')).read_text(encoding='utf-8'))
    if row.get('deleted'):raise HTTPException(404,'この演出は削除されています')
    return Action.model_validate(row['action'])


async def play_bundle(sid,request_id,action,preview=False,update_preview_id=None):
    from .runtime import get
    s=get(sid);recipe=bundle(action,preview)
    performance.check_assets([Scene(appearance=recipe.appearance)])
    count=len(s.project.get('expressionPresets',[])) if isinstance(s.project.get('expressionPresets'),list) else 5
    if any(c.kind=='expression' and c.expression_index>=count for c in recipe.components):raise HTTPException(422,'このキャラクターの表情を選んでください')
    if action.project_id and action.project_id!=s.project.get('id'):raise HTTPException(422,'別のキャラクター用の演出です')
    duration=max([action.duration]+[c.duration/c.speed for c in recipe.components if c.kind in ('ink','dissolve','appear','comms','happy','bounce','glitch','blocks')])
    return await runtime_effects.play(sid,runtime_effects.Effect(request_id=request_id,preset='bundle',recipe=recipe,duration=min(30,duration),preview=preview,update_preview_id=update_preview_id))


class Preview(Strict):
    update_preview_id: str | None = Field(None,min_length=1,max_length=80,pattern=r'^[\w-]+$')
    request_id: str = Field(min_length=1,max_length=80,pattern=r'^[\w-]+$')
    action: Action


@router.post('/sessions/{sid}/preview',status_code=202)
async def preview(sid: str, body: Preview):
    if body.action.kind!='bundle':raise HTTPException(422,'組み合わせ演出を選んでください')
    return await play_bundle(sid,body.request_id,body.action,True,body.update_preview_id)


class StopPreview(Strict):
    request_id: str = Field(min_length=1,max_length=80,pattern=r'^[\w-]+$')
    expected_request_id: str = Field(min_length=1,max_length=80,pattern=r'^[\w-]+$')


@router.post('/sessions/{sid}/preview/stop',status_code=202)
async def stop_preview(sid: str, body: StopPreview):
    return await runtime_effects.play(sid,runtime_effects.Effect(request_id=body.request_id,preset='none',restore_preview_id=body.expected_request_id))


def look_patch(action):
    look=action.appearance.model_dump();kind=action.kind
    if kind in ('blush','sweat','gloom','image'):
        return {**{k:v for k,v in look.items() if k.startswith((kind+'_','emotion_','image_'))},'emotion':kind}
    if kind=='outline':return {k:(True if k=='outline' else v) for k,v in look.items() if k.startswith('outline')}
    if kind=='light':return {k:v for k,v in look.items() if k.startswith('light')}
    if kind=='colors':return {'colors':look['colors']}
    return Appearance().model_dump()


async def restore(s, keys, old, applied, token):
    await asyncio.sleep(token['duration'])
    async with s.lock:
        # Only revert values this timer still owns, preserving later user edits.
        current=s.stage['baseline']['appearance']
        owners=getattr(s,'avatar_timers',{})
        for key in keys:
            if owners.get(key)==token['id'] and current.get(key)==applied[key]:current[key]=old[key]
        s.stage['revision']+=1
        try:await performance.publish(s)
        except (RuntimeError,asyncio.TimeoutError):pass


@router.post('/sessions/{sid}/trigger', status_code=202)
async def trigger(sid: str, body: Trigger):
    from .runtime import get
    s=get(sid)
    async with s.lock:
        receipts=getattr(s,'avatar_requests',None)
        if receipts is None:s.avatar_requests=receipts=OrderedDict()
        if body.request_id in receipts:
            receipt=receipts[body.request_id]
            if receipt['preset_id']!=body.preset_id:raise HTTPException(409,'同じrequest_idを別の演出に使えません')
            return receipt
        if not s.status()['connected']:raise HTTPException(409,'キャラクターの画面を開いてください')
        action=load(body.preset_id)
        if action.project_id and action.project_id != s.project.get('id'):raise HTTPException(422,'別のキャラクター用の演出です')
        receipt=dict(request_id=body.request_id,preset_id=body.preset_id,status='accepted',kind=action.kind,
                     result_url=f'/api/avatar/sessions/{sid}/trigger/{body.request_id}')
        receipts[body.request_id]=receipt
        while len(receipts)>100:receipts.popitem(last=False)
    try:
        if action.kind=='bundle':
            await play_bundle(sid,body.request_id,action)
        elif action.kind in ('ink','dissolve','appear','comms','happy','bounce','glitch','blocks'):
            await runtime_effects.play(sid,runtime_effects.Effect(request_id=body.request_id,preset=action.kind,
                direction=action.direction,duration=action.duration,strength=action.strength))
        else:
            async with s.lock:
                patch=look_patch(action);old=dict(s.stage['baseline']['appearance'])
                primary='emotion' if action.kind in ('blush','sweat','gloom','image') else action.kind
                if action.behavior=='toggle' and action.kind!='reset' and all(old.get(k)==v for k,v in patch.items()):
                    patch[primary]={'emotion':'none','outline':False,'light':'none','colors':[]}.get(primary)
                scene=Scene.model_validate({**s.stage['baseline'],'appearance':{**old,**patch}})
                performance.check_assets([scene]);performance.check_colors([scene],s.project)
                performance.reset(s);s.stage['baseline']=scene.model_dump()
                if not hasattr(s,'avatar_timers'):s.avatar_timers={}
                s.avatar_timers.update({key:body.request_id for key in patch})
                await performance.publish(s)
                receipt['status']='applied'
                if action.behavior=='timed' and action.kind!='reset':
                    task=asyncio.create_task(restore(s,list(patch),old,patch,{'id':body.request_id,'duration':action.duration}))
                    timers.add(task);task.add_done_callback(timers.discard)
            if action.kind=='reset':
                await runtime_effects.play(sid,runtime_effects.Effect(request_id=body.request_id,preset='none'))
    except Exception as error:
        receipt.update(status='failed',error=str(getattr(error,'detail',error)))
        if isinstance(error,ValidationError):raise HTTPException(422,'演出の設定を確認してください') from error
        raise
    return receipt


@router.get('/sessions/{sid}/trigger/{request_id}')
def result(sid: str, request_id: str):
    from .runtime import get
    s=get(sid);receipt=getattr(s,'avatar_requests',{}).get(request_id)
    if not receipt:raise HTTPException(404,'演出の実行履歴がありません')
    if request_id in s.effect_requests:
        runtime_effects.expire(s)
        return {**receipt,'status':s.effect_requests[request_id]['status'],'error':s.effect_requests[request_id].get('error')}
    return receipt
