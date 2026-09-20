"""Ephemeral, editor-independent avatar players. Speech is never replayed on reconnect."""
import asyncio
import json
import hashlib
import time
import uuid
from collections import OrderedDict
from typing import Literal

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, ConfigDict, Field, model_validator

from .control import valid_origin
from . import runtime_effects, performance

router = APIRouter(prefix='/api/runtime', tags=['Character output'])
sessions = OrderedDict()
active_session_id = None
fixed_requests = OrderedDict()
routing_lock = asyncio.Lock()


class Launch(BaseModel):
    model_config = ConfigDict(extra='forbid')
    project: dict
    tts: dict
    gain: float = Field(5, ge=1, le=20)
    accepting: bool = False
    ai_enabled: bool = False


class Speech(BaseModel):
    model_config = ConfigDict(extra='forbid')
    request_id: str = Field(min_length=1, max_length=80, pattern=r'^[\w-]+$')
    action: Literal['speak', 'replace', 'stop'] = 'speak'
    text: str = Field('', max_length=2000)
    expected_utterance_id: str | None = Field(None, max_length=80)

    @model_validator(mode='after')
    def valid(self):
        if self.action != 'stop' and not self.text.strip():
            raise ValueError('text required')
        if self.action in ('replace', 'stop') and not self.expected_utterance_id:
            raise ValueError('expected_utterance_id required')
        return self


class Session:
    def __init__(self, body):
        self.id = uuid.uuid4().hex
        self.project, self.tts, self.gain = body.project, body.tts, body.gain
        self.character_id = hashlib.sha256(json.dumps(self.project,sort_keys=True,ensure_ascii=False).encode()).hexdigest()[:32]
        self.characters = {self.character_id: self.project}
        self.player = None
        self.viewers = set()
        self.state = 'closed'
        self.ready = False
        self.heartbeat = 0
        self.current = None
        self.pending = None
        self.requests = OrderedDict()
        self.expression_requests = OrderedDict()
        self.expression = None
        self.effect_requests = OrderedDict()
        self.effect = None
        performance.initialize(self)
        if body.ai_enabled:
            self.stage['mode'] = 'ai'
        self.voice_revision = 0
        self.revision = 0
        self.pose = None
        self.error = None
        self.lock = asyncio.Lock()
        self.touched = time.time()
        self.deadline = 0
        self.accepting = body.accepting

    def status(self):
        performance.expire(self)
        runtime_effects.expire(self)
        fresh = self.player is not None and time.time() - self.heartbeat < 8
        for item in self.expression_requests.values():
            if item['status'] == 'accepted' and time.time() - item['created'] > 10:
                item.update(status='unknown', error='表情の適用確認が届きません。出力の状態を確認してください')
        return dict(session_id=self.id, character_id=self.character_id, connected=fresh, ready=fresh and self.ready,
                    stage=self.stage,
                    effect=self.effect if fresh else None,
                    expression=self.expression if fresh else None,
                    expressions=[str(p.get('name') or f'表情 {i+1}')[:40] if isinstance(p, dict) else f'表情 {i+1}'
                                 for i, p in enumerate(self.project.get('expressionPresets', []))][:12]
                    if isinstance(self.project.get('expressionPresets'), list) else ['通常', '笑顔', '驚き', '困り顔', 'ウインク'],
                    accepting=self.accepting,
                    voice_revision=self.voice_revision,
                    tts={k: v for k, v in self.tts.items() if k not in ('api_key', 'text')},
                    state=self.state if fresh else 'closed', revision=self.revision,
                    current=self.current if fresh else None, pending=self.pending if fresh else None,
                    caption=self.current['text'] if fresh and self.state == 'speaking' and self.current else '',
                    error=self.error, updated_at=self.heartbeat)

    async def send(self, message):
        if self.player:
            await asyncio.wait_for(self.player.send_json(message), 2)

    async def broadcast(self, message):
        async def one(ws):
            try:
                await asyncio.wait_for(ws.send_json(message), 1)
            except Exception:
                self.viewers.discard(ws)
        await asyncio.gather(*(one(ws) for ws in tuple(self.viewers)))

    async def changed(self):
        self.revision += 1
        self.touched = time.time()
        await self.broadcast(dict(type='status', **self.status()))

    def finish(self, utterance, state, error=None):
        if utterance:
            self.requests[utterance['request_id']].update(status=state, error=error)

    async def disconnected(self):
        performance.reset(self, 'unknown')
        self.stage['mode'] = 'fixed'
        for item in self.effect_requests.values():
            if item['status'] in ('accepted', 'running'):
                item.update(status='unknown', error='出力が切断され、演出の結果を確認できません')
        self.effect = None
        for item in self.expression_requests.values():
            if item['status'] == 'accepted':
                item.update(status='unknown', error='出力が切断され、適用結果を確認できません')
        self.expression = None
        self.finish(self.current, 'interrupted', 'Player disconnected')
        self.finish(self.pending, 'failed', 'Player disconnected')
        self.current = self.pending = self.pose = None
        self.player = None
        self.ready = False
        self.state = 'closed'
        await self.changed()

    async def retire(self):
        for ws in tuple(self.viewers):
            try:
                await ws.close(code=1008, reason='Session expired')
            except Exception:
                pass
        self.viewers.clear()
        self.project = self.tts = {}


def get(sid):
    if sid not in sessions:
        raise HTTPException(404, '出力セッションがありません。出力ウィンドウを開き直してください')
    return sessions[sid]


def validated_tts(value):
    from .server import TTSRequest, tts_base
    if value.get('engine') == 'browser':
        return dict(engine='browser', browser_voice=str(value.get('browser_voice', ''))[:500])
    try:
        label = str(value.get('label', ''))[:500]
        config = TTSRequest(**value)
        tts_base(config.base_url.removesuffix('/v1') if config.engine == 'irodori' else config.base_url)
        result = config.model_dump()
        result['api_key'] = config.api_key.get_secret_value()
        result['label'] = label
        return result
    except ValueError:
        raise HTTPException(422, '音声エンジンの設定を確認してください')


@router.post('/sessions', status_code=201)
async def launch(body: Launch):
    global active_session_id
    if not isinstance(body.project.get('parts'), list) or not body.project['parts']:
        raise HTTPException(422, 'キャラクターを読み込んでください')
    from .limits import PROJECT_BYTES
    if len(json.dumps(body.project, ensure_ascii=False).encode('utf-8')) > PROJECT_BYTES:
        raise HTTPException(413, '出力用の素材は100MB以下にしてください')
    body.tts = validated_tts(body.tts)
    # Bound retained snapshots; live players are never evicted.
    retired = []
    for sid, session in list(sessions.items()):
        if session.player is None and time.time() - session.touched > 3600:
            retired.append(sessions.pop(sid))
    if len(sessions) >= 4:
        removable = next((sid for sid, s in sessions.items() if s.player is None), None)
        if removable is None:
            raise HTTPException(409, '出力ウィンドウは同時に4つまでです')
        retired.append(sessions.pop(removable))
    session = Session(body)
    async with routing_lock:
        previous = sessions.get(active_session_id)
        if previous:
            async with previous.lock:
                previous.accepting = False
                await previous.changed()
        sessions[session.id] = session
        active_session_id = session.id
    for old in retired:
        await old.retire()
    return dict(session_id=session.id, player_url=f'/web/player.html?session={session.id}',
                display_url=f'/web/player.html?session={session.id}&display=1',
                status_url=f'/api/runtime/sessions/{session.id}')


def public_status(s):
    if not s:
        return dict(connected=False, ready=False, accepting=False, state='closed',
                    current=None, pending=None, character=None, error=None)
    value = s.status()
    value.pop('session_id')
    value['character'] = s.project.get('name', 'キャラクター')
    return value


@router.get('/status')
async def active_status():
    return public_status(sessions.get(active_session_id))


@router.post('/speech', status_code=202)
async def active_speech(body: Speech):
    async with routing_lock:
        previous = fixed_requests.get(body.request_id)
        if previous:
            if previous['request'] != body.model_dump():
                raise HTTPException(409, 'request_idが別の発話に使われています')
            return {k: v for k, v in previous.items() if k != 'request'}
        s = sessions.get(active_session_id)
        if not s:
            raise HTTPException(409, 'キャラクターの出力ウィンドウを開いてください')
        if len(fixed_requests) >= 400:
            key = next((k for k, v in fixed_requests.items() if v['status'] in ('completed', 'failed', 'interrupted')), None)
            if key is None:
                raise HTTPException(503, '発話の完了を待ってください')
            del fixed_requests[key]
        try:
            return await _speech(s, body)
        finally:
            # Retain the same mutable receipt across target switches/disconnects.
            if body.request_id in s.requests:
                fixed_requests[body.request_id] = s.requests[body.request_id]


@router.get('/speech/{request_id}')
async def active_result(request_id: str):
    item = fixed_requests.get(request_id)
    if not item:
        raise HTTPException(404, '保持中の発話履歴にありません')
    return {k: v for k, v in item.items() if k != 'request'}


class Reception(BaseModel):
    model_config = ConfigDict(extra='forbid')
    accepting: bool


@router.post('/sessions/{sid}/reception')
async def reception(sid: str, body: Reception):
    global active_session_id
    async with routing_lock:
        s = get(sid)
        if body.accepting:
            old = sessions.get(active_session_id)
            if old and old is not s:
                async with old.lock:
                    old.accepting = False
                    await old.changed()
            active_session_id = s.id
        async with s.lock:
            s.accepting = body.accepting
            await s.changed()
        return s.status()


@router.get('/sessions')
async def listing():
    return [dict(**s.status(), name=s.project.get('name', 'キャラクター')) for s in sessions.values()]


@router.get('/sessions/{sid}')
async def status(sid: str):
    return get(sid).status()


@router.get('/sessions/{sid}/project')
async def snapshot(sid: str):
    s = get(sid)
    # Secrets stay on the server, never in projects, status, URLs or display clients.
    return dict(project=s.project, character_id=s.character_id, **voice_state(s))


def voice_state(s):
    return dict(engine=s.tts['engine'], browser_voice=s.tts.get('browser_voice', ''), gain=s.gain,
                voice_revision=s.voice_revision, tts={k: v for k, v in s.tts.items() if k not in ('api_key', 'text')})


class VoiceUpdate(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    revision: int = Field(ge=0, strict=True)
    tts: dict
    gain: float = Field(5, ge=1, le=20)


@router.put('/sessions/{sid}/voice')
async def configure_voice(sid: str, body: VoiceUpdate):
    s = get(sid)
    tts = validated_tts(body.tts)
    async with s.lock:
        if body.revision != s.voice_revision:
            raise HTTPException(409, '音声設定が更新されています。読み直してください')
        if s.current or s.pending:
            raise HTTPException(409, '発話が終わってから音声設定を変更してください')
        s.tts, s.gain = tts, body.gain
        s.voice_revision += 1
        public = voice_state(s)
        s.project.setdefault('voiceSettings', {})['ttsConfig'] = dict(selected=tts['engine'], engines={tts['engine']:public['tts']})
        s.project.pop('broadcastVoiceError', None)
        await s.changed()
        await s.send(dict(type='voice', **public))
        return public


@router.post('/sessions/{sid}/close')
async def close(sid: str):
    s = get(sid)
    async with s.lock:
        if s.player:
            try:
                await s.send(dict(type='close'))
            except Exception:
                pass
        await s.disconnected()
    return s.status()


@router.post('/sessions/{sid}/speech', status_code=202)
async def speech(sid: str, body: Speech):
    async with routing_lock:
        return await _speech(get(sid), body)


async def _speech(s, body):
    async with s.lock:
        if body.request_id in s.requests:
            previous = s.requests[body.request_id]
            if previous['request'] != body.model_dump():
                raise HTTPException(409, 'request_idが別の発話に使われています')
            return {k: v for k, v in previous.items() if k != 'request'}
        if not s.accepting:
            raise HTTPException(409, 'AI・外部プログラムからの発話受付はオフです')
        if not s.status()['ready']:
            raise HTTPException(409, '出力ウィンドウで音声を有効にしてください')
        if s.state == 'stopping':
            raise HTTPException(409, '停止処理中です。状態を再確認してください')
        if body.action == 'speak' and s.current:
            raise HTTPException(409, '発話中です。待つか、発話IDを指定してreplaceしてください')
        if body.action != 'speak' and (not s.current or body.expected_utterance_id != s.current['id']):
            raise HTTPException(409, '発話が変わりました。状態を再確認してください')
        uid = uuid.uuid4().hex
        item = dict(id=uid, request_id=body.request_id, status='accepted', request=body.model_dump())
        s.requests[body.request_id] = item
        while len(s.requests) > 100:
            key = next((k for k, v in s.requests.items() if v['status'] in ('completed', 'interrupted', 'failed')), None)
            if key is None:
                break
            del s.requests[key]
        s.error = None
        utterance = dict(id=uid, request_id=body.request_id, text=body.text)
        try:
            if body.action == 'speak':
                s.current = utterance
                s.state = 'synthesizing'
                s.deadline = time.time() + 400
                await s.send(dict(type='speak', **utterance))
            else:
                s.pending = utterance if body.action == 'replace' else dict(**utterance, stop_only=True)
                s.state = 'stopping'
                s.deadline = time.time() + 5
                await s.send(dict(type='stop', id=s.current['id']))
            await s.changed()
        except Exception:
            await s.disconnected()
            raise HTTPException(503, '出力ウィンドウとの接続が切れました')
        return {k: v for k, v in item.items() if k != 'request'}


@router.get('/sessions/{sid}/speech/{request_id}')
async def result(sid: str, request_id: str):
    item = get(sid).requests.get(request_id)
    if not item:
        raise HTTPException(404, '直近100件の発話履歴にありません')
    return {k: v for k, v in item.items() if k != 'request'}


class Synthesis(BaseModel):
    utterance_id: str
    text: str = Field(min_length=1, max_length=200)


@router.post('/sessions/{sid}/audio')
async def audio(sid: str, body: Synthesis):
    from .server import TTSRequest, synthesize
    s = get(sid)
    if not s.status()['ready'] or not s.current or s.current['id'] != body.utterance_id or s.state == 'stopping':
        raise HTTPException(409, 'この発話は終了しています')
    if s.tts['engine'] == 'browser':
        raise HTTPException(422, 'ブラウザ音声は出力ウィンドウで再生します')
    return await synthesize(TTSRequest(**{**s.tts, 'text': body.text}))


class Expression(BaseModel):
    model_config = ConfigDict(extra='forbid')
    request_id: str = Field(min_length=1, max_length=80, pattern=r'^[\w-]+$')
    index: int = Field(ge=0, le=11, strict=True)
    strength: float = Field(default=1, ge=0, le=1)


@router.post('/sessions/{sid}/expression', status_code=202)
async def select_expression(sid: str, body: Expression):
    s = get(sid)
    async with s.lock:
        existing = s.expression_requests.get(body.request_id)
        if existing:
            if existing['command'] != body.model_dump():
                raise HTTPException(409, '同じrequest_idを別の表情操作に再利用できません')
            s.status()
            return existing
        if not s.status()['connected']:
            raise HTTPException(409, '出力ウィンドウが接続されていません')
        if body.index >= len(s.status()['expressions']):
            raise HTTPException(422, '指定した表情がありません')
        item = dict(request_id=body.request_id, status='accepted', created=time.time(),
                    command=body.model_dump(), result_url=f'/api/runtime/sessions/{sid}/expression/{body.request_id}')
        s.expression_requests[body.request_id] = item
        while len(s.expression_requests) > 100:
            s.expression_requests.popitem(last=False)
        try:
            await s.send(dict(type='expression', action='select', index=body.index,
                              strength=body.strength, request_id=body.request_id))
        except (RuntimeError, asyncio.TimeoutError):
            item.update(status='unknown', error='送信結果を確認できません。状態を確認してください')
        return item


@router.get('/sessions/{sid}/expression/{request_id}')
async def expression_result(sid: str, request_id: str):
    s = get(sid)
    s.status()
    if request_id not in s.expression_requests:
        raise HTTPException(404, '表情操作の結果がありません（直近100件・再起動で消去）')
    return s.expression_requests[request_id]


def expression_state(value):
    if (isinstance(value, dict) and type(value.get('index')) is int and 0 <= value['index'] <= 11
            and type(value.get('strength')) in (int, float) and 0 <= value['strength'] <= 1):
        return dict(index=value['index'], strength=value['strength'])
    return None


@router.websocket('/sessions/{sid}/socket/{role}')
async def socket(ws: WebSocket, sid: str, role: str):
    if sid not in sessions or role not in ('player', 'display') or not valid_origin(ws):
        await ws.close(code=1008)
        return
    s = sessions[sid]
    async with s.lock:
        if role == 'player' and s.player:
            await ws.close(code=1008, reason='出力ウィンドウは既に開いています')
            return
        await ws.accept()
        if role == 'player':
            s.player = ws
            s.heartbeat = time.time()
            s.state = 'starting'
            await s.changed()
        else:
            s.viewers.add(ws)
    await ws.send_json(dict(type='status', **s.status()))
    try:
        while True:
            raw = await asyncio.wait_for(ws.receive_text(), 10 if role == 'player' else 60)
            if len(raw) > 16384:
                await ws.close(code=1009)
                break
            msg = json.loads(raw)
            if role != 'player':
                continue
            async with s.lock:
                if s.player is not ws:
                    break
                s.heartbeat = time.time()
                kind = msg.get('type')
                current_expression = expression_state(msg.get('expression'))
                if current_expression is not None:
                    s.expression = current_expression
                if s.current and time.time() > s.deadline:
                    s.error = '発話の応答が途絶えたため接続を終了しました'
                    await ws.close(code=1011, reason='Speech timed out')
                    break
                if kind == 'character_result':
                    from .runtime_characters import acknowledge
                    acknowledge(s,msg)
                elif kind == 'stage_result':
                    await performance.acknowledge(s, msg)
                elif kind == 'effect_result':
                    if runtime_effects.acknowledge(s, msg):
                        await s.changed()
                elif kind == 'expression_result':
                    item = s.expression_requests.get(msg.get('request_id'))
                    if item and item['status'] in ('accepted', 'unknown'):
                        matches = current_expression and all(current_expression[k] == item['command'][k] for k in ('index', 'strength'))
                        item.update(status='completed' if matches and not msg.get('error') else 'failed',
                                    result=current_expression, error=str(msg.get('error') or '表情が一致しません')[:500] if not matches or msg.get('error') else None)
                        await s.changed()
                elif kind == 'ready':
                    s.ready = msg.get('ready') is True
                    if not s.ready:
                        s.finish(s.current, 'interrupted', 'Audio is not ready')
                        s.finish(s.pending, 'failed', 'Audio is not ready')
                        s.current = s.pending = None
                    if not s.current:
                        s.state = 'idle' if s.ready else 'starting'
                    await s.changed()
                elif kind == 'pose' and isinstance(msg.get('pose'), dict):
                    if msg.get('character_id',s.character_id)!=s.character_id:continue
                    runtime_effects.update_cue(s, msg)
                    caption = str(msg.get('caption', ''))[:2000] if s.state == 'speaking' else ''
                    s.pose = dict(type='pose', character_id=s.character_id, pose=msg['pose'], time=msg.get('time', 0), effect=s.effect, caption=caption)
                    await s.broadcast(s.pose)
                elif s.current and msg.get('id') == s.current['id']:
                    if kind in ('speaking', 'synthesizing') and s.state != 'stopping':
                        s.state = kind
                        s.deadline = time.time() + (320 if kind == 'speaking' else 400)
                        s.requests[s.current['request_id']]['status'] = kind
                        await s.changed()
                    elif kind == 'stopped' and s.state == 'stopping':
                        s.finish(s.current, 'interrupted')
                        next_speech = s.pending
                        s.current = s.pending = None
                        if next_speech and not next_speech.get('stop_only'):
                            s.current = next_speech
                            s.state = 'synthesizing'
                            s.deadline = time.time() + 400
                            await s.send(dict(type='speak', **next_speech))
                        else:
                            s.finish(next_speech, 'completed')
                            s.state = 'idle'
                        await s.changed()
                    elif kind in ('finished', 'error') and s.state != 'stopping':
                        s.error = str(msg.get('error', '音声エラー'))[:500] if kind == 'error' else None
                        s.finish(s.current, 'failed' if s.error else 'completed', s.error)
                        s.current = None
                        s.state = 'error' if s.error else 'idle'
                        await s.changed()
    except (WebSocketDisconnect, ValueError, RuntimeError, asyncio.TimeoutError):
        pass
    finally:
        async with s.lock:
            if role == 'player' and s.player is ws:
                await s.disconnected()
            s.viewers.discard(ws)
        try:
            await ws.close()
        except (RuntimeError,WebSocketDisconnect):
            pass
