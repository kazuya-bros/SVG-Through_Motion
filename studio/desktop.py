"""Narrow authenticated bridge for the native desktop controller.

The process secret is passed through the environment and never exposed to web
pages. Browser/OBS clients keep the existing same-origin runtime connection.
"""
import hmac
import os
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from . import runtime


def authorize(authorization: str = Header(default='')):
    token = os.environ.get('SVG_THROUGH_DESKTOP_TOKEN', '')
    if not token or not hmac.compare_digest(authorization, 'Bearer ' + token):
        raise HTTPException(403, 'デスクトップアプリから操作してください。')


router = APIRouter(prefix='/api/desktop', dependencies=[Depends(authorize)])
DEFAULT_NAMES = ['通常', '笑顔', '驚き', '困り顔', 'ウインク']


@router.get('/health')
def health():
    from .paths import DATA
    return dict(protocol=1, data_dir=str(DATA))


@router.get('/sessions')
def listing():
    from .avatar_actions import listing as actions
    from .runtime_characters import roster
    return [dict(id=s.id, name=s.project.get('name', 'キャラクター'),
                 actions=[dict(id=a['id'],name=a['action']['name']) for a in actions(s.project.get('id',''))],
                 characters=roster(s),connected=s.status()['connected'],
                 expressions=[str(p.get('name') or f'表情 {i+1}')[:40]
                              for i, p in enumerate(s.project.get('expressionPresets', []))][:12]
                 if isinstance(s.project.get('expressionPresets'), list) else DEFAULT_NAMES)
            for s in runtime.sessions.values()]


class ExpressionCommand(BaseModel):
    model_config = ConfigDict(extra='forbid')
    session_id: str = Field(pattern=r'^[a-f0-9]{32}$')
    action: Literal['select', 'hold', 'release', 'release_all', 'cue']
    cue_id: str = Field('', max_length=32)
    character_id: str = Field('',max_length=100)
    index: int = Field(default=0, ge=0, le=11)
    key: str = Field(default='', max_length=100)


@router.post('/expression')
async def expression(body: ExpressionCommand):
    if body.action=='cue':
        from .avatar_actions import trigger, Trigger
        if len(body.cue_id)!=32 or any(c not in '0123456789abcdef' for c in body.cue_id):raise HTTPException(422,'演出を選んでください')
        if body.character_id:
            from .runtime_characters import switch,Switch
            return await switch(body.session_id,Switch(request_id=uuid.uuid4().hex,character_id=body.character_id,preset_id=body.cue_id))
        return await trigger(body.session_id,Trigger(request_id=uuid.uuid4().hex,preset_id=body.cue_id))
    s = runtime.get(body.session_id)
    async with s.lock:
        if not s.status()['connected']:
            raise HTTPException(409, '出力ウィンドウが接続されていません。')
        presets = s.project.get('expressionPresets')
        count = min(12, len(presets)) if isinstance(presets, list) else 5
        if body.action in ('select', 'hold') and body.index >= count:
            raise HTTPException(422, 'このキャラクターに指定した表情がありません。')
        if body.action in ('hold', 'release') and not body.key:
            raise HTTPException(422, '一時表情のキーがありません。')
        await s.send(dict(type='expression', **body.model_dump(exclude={'session_id','cue_id','character_id'})))
    return dict(sent=True)
