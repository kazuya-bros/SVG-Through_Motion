"""Local editor command bridge and read-only OBS subscribers.

Commands require a connected editor; results distinguish acceptance from execution.
No project files are modified by this broker.
"""
import asyncio
import json
import time
import uuid
from collections import OrderedDict
from typing import Literal

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, ConfigDict, Field, model_validator

router = APIRouter(prefix='/api/control', tags=['AI control / OBS'])

MOTION_RANGES = {'earCycles': (1,6), 'frontHairCycles': (1,4), 'backHairCycles': (1,4), 'irisX': (0,20), 'irisScale': (0,10), 'irisCycles': (1,4), 'duration': (1,30), 'sway': (0,12), 'breathe': (0,40), 'headPitch': (-1,1),
                'pitchSway': (0,1), 'headYaw': (0,1), 'headTilt': (0,8), 'headNod': (0,6),
                'bodyFollow': (0,1), 'frontHair': (0,40), 'backHair': (0,70), 'hairTip': (1,3),
                'tailSwing': (0,30), 'tailCycles': (1,4), 'armSwing': (0,10), 'hairBend': (0,30), 'springCycles': (1,4), 'springSoftness': (0,1),
                'bounceHeight': (0,160), 'hair': (0,25), 'chest': (0,40), 'ears': (0,30)}


def validate_motion_settings(settings):
    import math
    if not isinstance(settings, dict) or not settings:
        raise ValueError('motion settings required')
    for key, value in settings.items():
        if key in ('blink', 'talking', 'rigEnabled', 'independentHair', 'singleBounce'):
            valid = isinstance(value, bool)
        elif key == 'irisGaze':
            valid = value in ('natural','sweep')
        elif key == 'earPattern':
            valid = value in ('twitch','double','alternate','droop','up','natural')
        elif key in ('hairMethod','frontHairMethod','backHairMethod'):
            valid = value in ('wave', 'spring', 'off')
        elif key in MOTION_RANGES:
            lo, hi = MOTION_RANGES[key]
            valid = not isinstance(value, bool) and isinstance(value, (int, float)) and math.isfinite(value) and lo <= value <= hi
            if key in ('tailCycles','earCycles','springCycles','frontHairCycles','backHairCycles','irisCycles'):
                valid = valid and int(value) == value
        else:
            valid = False
        if not valid:
            raise ValueError(f'Unsupported motion setting: {key}')
    return settings


class AssistCapabilities(BaseModel):
    model_config=ConfigDict(extra='forbid',strict=True)
    inspect_images: bool
    edit_project: bool
    generate_images: bool=False


class AssistAssessment(BaseModel):
    model_config=ConfigDict(extra='forbid')
    status: Literal['pass','limitations']
    notes: str=Field(min_length=1,max_length=4000)
    evidence: list[str]=Field(min_length=1,max_length=17)


class AssistCommand(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    operation: Literal['inspect', 'start', 'edit', 'motion', 'restore', 'review', 'apply', 'undo', 'cancel', 'save', 'list', 'resume', 'claim', 'prepare_asset', 'attach_asset', 'finish']
    operation_id: str | None = Field(None, min_length=1, max_length=80, pattern=r'^[a-zA-Z0-9_-]+$')
    session_id: str | None = Field(None, pattern=r'^[a-f0-9-]{36}$')
    revision: int | None = Field(None, ge=0, le=60, strict=True)
    target_revision: int | None = Field(None, ge=0, le=60, strict=True)
    part_id: str | None = Field(None, pattern=r'^p[0-9]{3}$')
    values: dict[str, float] | None = None
    settings: dict | None = None
    mode: Literal['finish','from_inputs']='finish'
    wish: str=Field('',max_length=2000)
    targets: list[str] | None=Field(None,max_length=100)
    allow_generation: bool=Field(False,strict=True)
    request_ai: bool=Field(False,strict=True)
    auto_apply: bool=Field(False,strict=True)
    capabilities: AssistCapabilities | None=None
    assessment: AssistAssessment | None=None
    asset_id: str | None=Field(None,pattern=r'^[a-f0-9]{32}$')

    @model_validator(mode='before')
    @classmethod
    def strict_values(cls, data):
        if isinstance(data, dict) and data.get('values') is not None:
            values = data['values']
            allowed = {'x', 'y', 'angle', 'width', 'height', 'curve', 'thickness'}
            if not isinstance(values, dict) or not values or not set(values).issubset(allowed):
                raise ValueError('values must contain supported shape fields')
            if any(isinstance(v, bool) or not isinstance(v, (float, int)) for v in values.values()):
                raise ValueError('shape values must be numbers')
        return data

    @model_validator(mode='after')
    def required_fields(self):
        if self.operation not in ('inspect', 'start', 'list') and self.session_id is None:
            raise ValueError('session_id required')
        if self.operation in ('edit', 'motion', 'restore', 'review', 'apply', 'save', 'prepare_asset', 'attach_asset', 'finish') and self.revision is None:
            raise ValueError('revision required')
        if self.operation in ('start', 'edit', 'motion', 'restore', 'apply', 'undo', 'cancel', 'claim', 'prepare_asset', 'attach_asset', 'finish') and not self.operation_id:
            raise ValueError('operation_id required')
        if self.operation == 'edit' and (not self.part_id or not self.values):
            raise ValueError('edit requires part_id and values')
        if self.operation == 'restore' and self.target_revision is None:
            raise ValueError('restore requires target_revision')
        if self.operation=='claim' and self.capabilities is None:raise ValueError('capabilities required')
        if self.operation=='finish' and self.assessment is None:raise ValueError('assessment required')
        if self.operation=='motion':validate_motion_settings(self.settings)
        elif self.settings is not None:raise ValueError('settings are only supported by motion')
        if self.operation=='prepare_asset' and self.part_id is None:raise ValueError('part_id required')
        if self.operation=='attach_asset' and self.asset_id is None:raise ValueError('asset_id required')
        return self


class Command(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    action: Literal['play', 'pause', 'seek', 'pose', 'settings', 'speak', 'stop', 'load', 'export', 'assist']
    assist: AssistCommand | None = None
    time: float | None = Field(None, ge=0, le=30)
    mouth: float | None = Field(None, ge=0, le=1)
    blinkL: float | None = Field(None, ge=0, le=1)
    blinkR: float | None = Field(None, ge=0, le=1)
    vowel: Literal['a', 'i', 'u', 'e', 'o'] | None = None
    reset: bool = False
    settings: dict | None = None
    text: str | None = Field(None, min_length=1, max_length=200)
    reading: str = Field('', max_length=300)
    project_id: str | None = Field(None, pattern=r'^[a-f0-9]{32}$')
    source: Literal['project', 'saved'] = 'project'
    format: Literal['png', 'project', 'frames', 'sheet', 'spritalk', 'mpng', 'png-parts'] = 'png'
    fps: int = Field(24, ge=1, le=60)
    duration: float | None = Field(None, ge=1, le=30)
    max_edge: int = Field(512, ge=64, le=2048)
    columns: int = Field(8, ge=1, le=32)

    @model_validator(mode='after')
    def validate_action(self):
        required = {'seek': 'time', 'settings': 'settings', 'speak': 'text', 'load': 'project_id', 'assist': 'assist'}
        if self.action in required and getattr(self, required[self.action]) is None:
            raise ValueError(f'{self.action} requires {required[self.action]}')
        if self.text is not None and not self.text.strip():
            raise ValueError('text must not be blank')
        if self.settings is not None:
            ranges = {**MOTION_RANGES, 'eyeThroughHairStrength': (0, 1)}
            for key, value in self.settings.items():
                if key in ('blink', 'talking', 'vowels', 'rigEnabled', 'eyeThroughHair', 'independentHair', 'singleBounce'):
                    if not isinstance(value, bool):
                        raise ValueError(f'{key} must be boolean')
                elif key == 'irisGaze':
                    if value not in ('natural','sweep'):raise ValueError(f'Unsupported gaze: {value}')
                elif key == 'earPattern':
                    if value not in ('twitch','double','alternate','droop','up','natural'):raise ValueError(f'Unsupported ear pattern: {value}')
                elif key in ('hairMethod','frontHairMethod','backHairMethod'):
                    if value not in ('wave','spring','off'):raise ValueError(f'Unsupported hair method: {value}')
                elif key in ranges:
                    lo, hi = ranges[key]
                    if key in ('tailCycles','earCycles','springCycles','frontHairCycles','backHairCycles','irisCycles') and (isinstance(value,bool) or not isinstance(value,(int,float)) or not float(value).is_integer()):raise ValueError(f'{key} must be an integer')
                    if isinstance(value, bool) or not isinstance(value, (int, float)) or not lo <= value <= hi:
                        raise ValueError(f'{key} must be {lo}..{hi}')
                else:
                    raise ValueError(f'Unsupported setting: {key}')
        return self


class Bridge:
    def __init__(self):
        self.editor = None
        self.viewers = set()
        self.snapshot = None
        self.pose = None
        self.state = {}
        self.results = OrderedDict()
        self.active = None

    async def broadcast(self, message):
        # Slow or abandoned OBS clients must not stall the editing window.
        async def send(ws):
            try:
                await asyncio.wait_for(ws.send_json(message), timeout=1)
            except Exception:
                self.viewers.discard(ws)
        await asyncio.gather(*(send(ws) for ws in tuple(self.viewers)))

    def finish(self, cid, status, **values):
        item = self.results.get(cid)
        if item and item['status'] == 'running':
            item.update(status=status, **values)
        if self.active == cid:
            self.active = None

    def expire(self):
        for cid, item in self.results.items():
            if item['status'] == 'running' and time.time() - item['created'] > 600:
                self.finish(cid, 'failed', error='Editor execution timed out; inspect editor before retrying')


bridge = Bridge()


@router.get('/status')
async def status():
    bridge.expire()
    return dict(connected=bridge.editor is not None, viewers=len(bridge.viewers),
                active_command=bridge.active, snapshot_ready=bridge.snapshot is not None, state=bridge.state)


@router.get('/project')
async def published_project():
    if bridge.snapshot is None:
        raise HTTPException(404, '編集画面から素材を反映してください')
    return bridge.snapshot


@router.post('/commands', status_code=202)
async def command(body: Command):
    bridge.expire()
    if bridge.editor is None:
        raise HTTPException(409, 'アプリ画面で「AI・OBS接続を開始」を押してください')
    if bridge.active and body.action != 'stop':
        raise HTTPException(409, '前の操作が実行中です。結果を確認するかstopで中断してください')
    if any(item['status'] == 'running' and item['action'] == 'stop' for item in bridge.results.values()):
        raise HTTPException(409, '停止処理の完了を待ってください')
    cid = uuid.uuid4().hex
    item = dict(id=cid, status='running', action=body.action, created=time.time())
    bridge.results[cid] = item
    if body.action != 'stop':
        bridge.active = cid
    while len(bridge.results) > 100:
        expired = next((key for key, value in bridge.results.items() if value['status'] != 'running'), None)
        if expired is None:
            break
        del bridge.results[expired]
    try:
        await bridge.editor.send_json(dict(type='command', id=cid, command=body.model_dump(exclude_none=True)))
    except Exception:
        bridge.finish(cid, 'failed', error='Editor disconnected')
        raise HTTPException(503, '編集画面との接続が切れました')
    return dict(id=cid, status=item['status'], result_url=f'/api/control/commands/{cid}')


@router.get('/commands/{cid}')
def result(cid: str):
    bridge.expire()
    if cid not in bridge.results:
        raise HTTPException(404, '操作が見つかりません（履歴は直近100件、サーバー再起動で消去）')
    return bridge.results[cid]


def valid_origin(ws):
    host = ws.url.hostname
    origin = ws.headers.get('origin')
    return host in ('127.0.0.1', 'localhost', '::1', 'testserver') and origin == f'http://{ws.url.netloc}'


@router.websocket('/socket/{role}')
async def socket(ws: WebSocket, role: str):
    if role not in ('editor', 'obs') or not valid_origin(ws):
        await ws.close(code=1008)
        return
    if role == 'editor' and bridge.editor is not None:
        await ws.close(code=1008, reason='Another editor is already connected')
        return
    await ws.accept()
    if role == 'editor':
        bridge.editor = ws
    else:
        bridge.viewers.add(ws)
        if bridge.snapshot:
            await ws.send_json(dict(type='project', revision=bridge.snapshot.get('revision')))
        if bridge.pose:
            await ws.send_json(bridge.pose)
    try:
        while True:
            raw = await ws.receive_text()
            if role != 'editor':
                continue  # OBS sockets cannot issue commands or change state.
            if len(raw) > 50 * 1024**2:
                await ws.close(code=1009)
                break
            msg = json.loads(raw)
            if not isinstance(msg, dict):
                await ws.close(code=1008)
                break
            kind = msg.get('type')
            if kind == 'project' and isinstance(msg.get('project'), dict):
                bridge.snapshot = msg
                await ws.send_json(dict(type='published', revision=msg.get('revision')))
                await bridge.broadcast(dict(type='project', revision=msg.get('revision')))
            elif kind == 'pose' and isinstance(msg.get('pose'), dict):
                bridge.pose = msg
                bridge.state = msg.get('state', {})
                await bridge.broadcast(msg)
            elif kind == 'result':
                bridge.finish(msg.get('id'), 'failed' if msg.get('error') else 'completed',
                              result=msg.get('result'), error=msg.get('error'))
    except (WebSocketDisconnect, ValueError, RuntimeError):
        pass
    finally:
        if role == 'editor' and bridge.editor is ws:
            bridge.editor = None
            bridge.snapshot = bridge.pose = None
            bridge.state = {}
            for cid in list(bridge.results):
                bridge.finish(cid, 'failed', error='Editor disconnected; execution result unknown')
            await bridge.broadcast(dict(type='disconnected'))
        bridge.viewers.discard(ws)
