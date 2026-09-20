"""Ephemeral visual cues, acknowledged by the player and mirrored to OBS."""
import asyncio
import time
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator
from .avatar_recipe import Bundle

router = APIRouter(prefix='/api/runtime', tags=['Character effects'])
PRESETS = [dict(id='glitch',name='輪郭ノイズ'),dict(id='blocks',name='ノイズブロックから現れる'),dict(id='none', name='元に戻す'), dict(id='dissolve', name='サラサラ消える'),
           dict(id='appear', name='粒から現れる'), dict(id='comms', name='通信中'),
           dict(id='happy', name='幸せの光'), dict(id='ink', name='線から色へ登場'), dict(id='bounce', name='はずみ')]


class Effect(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    request_id: str = Field(min_length=1, max_length=80, pattern=r'^[\w-]+$')
    preset: Literal['none', 'glitch', 'blocks', 'dissolve', 'appear', 'comms', 'happy', 'ink', 'bounce', 'bundle']
    recipe: Bundle | None = None
    preview: bool = False
    update_preview_id: str | None = Field(None,min_length=1,max_length=80,pattern=r'^[\w-]+$')
    restore_preview_id: str | None = Field(None,min_length=1,max_length=80,pattern=r'^[\w-]+$')
    direction: Literal['right', 'left', 'up', 'down'] = 'right'
    strength: float = Field(default=.7, ge=0, le=1)
    duration: float = Field(default=6, ge=.5, le=30)
    until_speech_end: bool = False

    @model_validator(mode='after')
    def bundle_recipe(self):
        if (self.preset=='bundle') != (self.recipe is not None):raise ValueError('組み合わせ演出の設定を確認してください')
        return self


class Cue(Effect):
    started_at: float = Field(ge=0, le=1e12)
    reduced: bool = False


def cue_state(value):
    if value is None:
        return None
    return Cue.model_validate(value).model_dump()


def expire(session):
    for item in session.effect_requests.values():
        if item['status'] in ('accepted', 'running'):
            limit = 10 if item['status'] == 'accepted' else item['command']['duration'] + 15
            if time.time() - item['created'] > limit:
                item.update(status='unknown', error='演出の実行結果が届きません。出力の状態を確認してください')


@router.get('/effects')
def presets():
    return dict(presets=PRESETS, max_duration=30, default_duration=6, concurrency=1,
                notes='新しい演出は前の演出を置き換えます。消滅後は非表示を維持。noneで復元。発話連動時は終了で復元。')


@router.post('/sessions/{sid}/effect', status_code=202)
async def play(sid: str, body: Effect):
    from .runtime import get
    s = get(sid)
    async with s.lock:
        expire(s)
        previous = s.effect_requests.get(body.request_id)
        if previous:
            if previous['command'] != body.model_dump():
                raise HTTPException(409, '同じrequest_idを違う演出に再利用できません')
            return previous
        if not s.status()['connected']:
            raise HTTPException(409, '出力ウィンドウが接続されていません')
        if body.until_speech_end and body.preset != 'none' and not s.current:
            raise HTTPException(409, '発話連動は発話中に使ってください')
        if sum(v['status'] in ('accepted', 'running') for v in s.effect_requests.values()) >= 8:
            raise HTTPException(409, '演出の適用確認を待ってください')
        item = dict(request_id=body.request_id, status='accepted', command=body.model_dump(),
                    created=time.time(), result_url=f'/api/runtime/sessions/{sid}/effect/{body.request_id}')
        s.effect_requests[body.request_id] = item
        while len(s.effect_requests) > 100:
            old = next(k for k, v in s.effect_requests.items() if v['status'] not in ('accepted', 'running'))
            del s.effect_requests[old]
        try:
            await s.send(dict(type='effect', **body.model_dump()))
        except (RuntimeError, asyncio.TimeoutError):
            item.update(status='unknown', error='送信結果を確認できません。出力の状態を確認してください')
        return item


@router.get('/sessions/{sid}/effect/{request_id}')
def result(sid: str, request_id: str):
    from .runtime import get
    s = get(sid)
    expire(s)
    if request_id not in s.effect_requests:
        raise HTTPException(404, '演出の結果がありません（直近100件・再起動で消去）')
    return s.effect_requests[request_id]


def acknowledge(s, message):
    item = s.effect_requests.get(message.get('request_id'))
    phase = message.get('status')
    if not item or item['status'] not in ('accepted', 'running', 'unknown'):
        return False
    if phase not in ('running', 'completed', 'interrupted', 'failed'):
        return False
    item.update(status=phase, error=str(message.get('error', '演出を実行できませんでした'))[:500] if phase == 'failed' else None)
    return True


def update_cue(s, message):
    if 'effect' not in message:
        return
    try:
        value = cue_state(message['effect'])
    except ValidationError:
        return
    if value is not None:
        receipt = s.effect_requests.get(value['request_id'])
        if not receipt or any(value[k] != receipt['command'][k] for k in ('preset', 'strength', 'duration', 'until_speech_end', 'direction','recipe','preview','restore_preview_id','update_preview_id')):
            return
    s.effect = value
