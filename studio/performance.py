"""Shared, bounded stage recipes for human controls and external AI agents."""
import asyncio
import hashlib
import io
import json
import os
import re
import time
import uuid
from collections import OrderedDict
from typing import Literal

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel, ConfigDict, Field, model_validator
from .paths import DATA

router = APIRouter(prefix='/api/stage', tags=['Stage and performance'])
STORE = DATA / 'stage'
library_lock = asyncio.Lock()


class Strict(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)


class Caption(Strict):
    enabled: bool = True
    source: Literal['speech', 'text'] = 'speech'
    text: str = Field('', max_length=2000)
    size: float = Field(42, ge=16, le=100, description='Font pixels relative to a 1080px-high canvas')
    color: str = Field('#ffffff', pattern=r'^#[0-9a-fA-F]{6}$')
    outline: str = Field('#202535', pattern=r'^#[0-9a-fA-F]{6}$')
    font: Literal['sans', 'serif', 'mono'] = 'sans'
    x: float = Field(.5, ge=.1, le=.9)
    y: float = Field(.84, ge=.1, le=.9)
    width: float = Field(.86, ge=.3, le=.95)
    reveal: Literal['instant', 'typewriter'] = 'instant'


class Overlay(Strict):
    asset_id: str = Field(pattern=r'^[a-f0-9]{32}$')
    anchor: Literal['canvas', 'head'] = 'canvas'
    layer: Literal['back', 'front'] = 'back'
    x: float = Field(.5, ge=-1, le=1.5, description='Canvas fraction; head anchor uses relative offset')
    y: float = Field(.3, ge=-1, le=1.5)
    scale: float = Field(.3, ge=.02, le=1.5, description='Width as a fraction of canvas width')
    opacity: float = Field(.8, ge=0, le=1)
    rotation: float = Field(0, ge=-180, le=180)
    motion: Literal['still', 'float', 'pulse', 'orbit'] = 'still'


class Pose(Strict):
    yaw: float = Field(0, ge=-1, le=1)
    pitch: float = Field(0, ge=-1, le=1)
    headRoll: float = Field(0, ge=-8, le=8)
    irisX: float = Field(0, ge=-20, le=20)
    irisY: float = Field(0, ge=-12, le=12)
    blinkL: float = Field(0, ge=0, le=1)
    blinkR: float = Field(0, ge=0, le=1)
    browL: float = Field(0, ge=-1, le=1)
    browR: float = Field(0, ge=-1, le=1)
    browTiltL: float = Field(0, ge=-1, le=1)
    browTiltR: float = Field(0, ge=-1, le=1)


class PartColor(Strict):
    part_id: str = Field(min_length=1, max_length=160)
    from_color: str = Field(pattern=r'^#[0-9a-fA-F]{6}$')
    to_color: str = Field(pattern=r'^#[0-9a-fA-F]{6}$')
    tolerance: float = Field(.08, ge=.01, le=.25)


class Appearance(Strict):
    outline: bool = False
    outline_color: str = Field('#8c91db', pattern=r'^#[0-9a-fA-F]{6}$')
    outline_width: float = Field(6, ge=0, le=16)
    outline_layers: int = Field(3, ge=1, le=3)
    outline_color_count: int = Field(2, ge=1, le=3)
    outline_color2: str = Field('#ffffff', pattern=r'^#[0-9a-fA-F]{6}$')
    outline_color3: str = Field('#ffffff', pattern=r'^#[0-9a-fA-F]{6}$')
    light: Literal['none', 'day', 'sunset', 'night', 'neon', 'background'] = 'none'
    light_strength: float = Field(.5, ge=0, le=1)
    light_color: str = Field('#e3be97', pattern=r'^#[0-9a-fA-F]{6}$')
    light_asset_id: str | None = Field(None, pattern=r'^[a-f0-9]{32}$')
    emotion: Literal['none', 'blush', 'gloom', 'sweat', 'image'] = 'none'
    blush_x: float = Field(0, ge=-1, le=1)
    blush_y: float = Field(0, ge=-1, le=1)
    blush_scale: float = Field(1, ge=.2, le=3)
    blush_spacing: float = Field(1, ge=.2, le=2)
    blush_rotation: float = Field(0, ge=-180, le=180)
    sweat_x: float = Field(.36, ge=-1, le=1)
    sweat_y: float = Field(-.25, ge=-1, le=1)
    sweat_scale: float = Field(.12, ge=.03, le=.4)
    sweat_rotation: float = Field(0, ge=-180, le=180)
    emotion_strength: float = Field(.6, ge=0, le=1)
    emotion_asset_id: str | None = Field(None, pattern=r'^[a-f0-9]{32}$')
    image_scale: float = Field(.22, ge=.02, le=1.5)
    image_x: float = Field(0, ge=-1, le=1)
    image_y: float = Field(-.15, ge=-1, le=1)
    image_rotation: float = Field(0, ge=-180, le=180)
    colors: list[PartColor] = Field(default_factory=list, max_length=24)

    @model_validator(mode='after')
    def unique_parts(self):
        if len({c.part_id for c in self.colors}) != len(self.colors):
            raise ValueError('パーツの色変更は1パーツにつき1設定です')
        if self.emotion == 'image' and not self.emotion_asset_id:
            raise ValueError('感情画像を選んでください')
        return self


class Scene(Strict):
    caption: Caption = Field(default_factory=Caption)
    overlays: list[Overlay] = Field(default_factory=list, max_length=8)
    pose: Pose = Field(default_factory=Pose)
    movement: float = Field(1, ge=0, le=2, description='Idle movement multiplier; live lip sync remains active')
    effect: Literal['none', 'comms', 'happy'] = 'none'
    effect_strength: float = Field(.7, ge=0, le=1)
    appearance: Appearance = Field(default_factory=Appearance)


class Step(Strict):
    at: float = Field(0, ge=0, le=119)
    scene: Scene = Field(default_factory=Scene)


class Recipe(Strict):
    name: str = Field('新しい演技', min_length=1, max_length=60)
    duration: float = Field(8, ge=1, le=120)
    transition: float = Field(.6, ge=.1, le=3)
    until_speech_end: bool = False
    steps: list[Step] = Field(default_factory=lambda: [Step()], min_length=1, max_length=8)

    @model_validator(mode='after')
    def timeline(self):
        times = [s.at for s in self.steps]
        if times[0] != 0 or times != sorted(set(times)) or times[-1] >= self.duration:
            raise ValueError('最初の工程は0秒、後続は昇順で演技時間内に指定してください')
        return self


class StageUpdate(Strict):
    revision: int = Field(ge=0)
    mode: Literal['fixed', 'ai']
    baseline: Scene | None = None


class Perform(Strict):
    request_id: str = Field(min_length=1, max_length=80, pattern=r'^[\w-]+$')
    revision: int = Field(ge=0)
    recipe: Recipe


class SavePreset(Strict):
    request_id: str = Field(min_length=1, max_length=80, pattern=r'^[\w-]+$')
    recipe: Recipe


def initialize(s):
    s.stage = dict(revision=0, mode='fixed', baseline=Scene().model_dump(), active=None)
    s.performances = OrderedDict()
    s.stage_captures = {}


def expire(s):
    active = s.stage['active']
    if active:
        receipt = s.performances[active['request_id']]
        limit = active['started_at'] + active['recipe']['duration'] + 10 if active['started_at'] else receipt['created'] + 20
        if time.time() > limit:
            receipt.update(status='unknown', error='出力の描画結果が届きません。現在の状態を確認してください')
            s.stage['active'] = None
            s.stage['revision'] += 1


def reset(s, status='interrupted'):
    active = s.stage['active']
    if active:
        s.performances[active['request_id']].update(status=status)
    s.stage.update(active=None, revision=s.stage['revision'] + 1)


async def publish(s):
    message = dict(type='stage', stage=s.stage)
    await s.send(message)
    await s.broadcast(message)


def folder(kind):
    result = STORE / kind
    result.mkdir(parents=True, exist_ok=True)
    return result


def write_json(path, value):
    temporary = path.with_suffix('.'+uuid.uuid4().hex+'.tmp')
    try:
        temporary.write_text(json.dumps(value, ensure_ascii=False), encoding='utf-8')
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def metadata(kind, identity):
    if not re.fullmatch(r'[a-f0-9]{32}', identity):
        raise HTTPException(404, '素材またはプリセットがありません')
    path = folder(kind) / (identity + '.json')
    if not path.is_file():
        raise HTTPException(404, '素材またはプリセットがありません')
    return json.loads(path.read_text(encoding='utf-8'))


def check_assets(scenes):
    for scene in scenes:
        for aid in (scene.appearance.light_asset_id, scene.appearance.emotion_asset_id):
            if aid:
                metadata('assets', aid)
        for overlay in scene.overlays:
            metadata('assets', overlay.asset_id)


def check_colors(scenes, project):
    parts = {p.get('id'): p for p in project.get('parts', [])}
    for scene in scenes:
        for color in scene.appearance.colors:
            part = parts.get(color.part_id)
            if not part or not part.get('svgText') or re.match(r'^(mouth|lash-|iris-|white-)', part.get('role', '')):
                raise HTTPException(422, '色変更の対象パーツを選び直してください')


@router.get('/library')
def library():
    return {kind: [json.loads(p.read_text(encoding='utf-8')) for p in sorted(folder(kind).glob('*.json'))]
            for kind in ('assets', 'presets')}


@router.post('/assets', status_code=201)
async def upload_asset(file: UploadFile = File(...), name: str = Form('演出画像', max_length=80),
                       source: str = Form('', max_length=500)):
    raw = await file.read(8 * 1024**2 + 1)
    if len(raw) > 8 * 1024**2:
        raise HTTPException(413, '演出画像は8MB以下にしてください')
    try:
        with Image.open(io.BytesIO(raw)) as image:
            if image.format not in ('PNG', 'JPEG', 'WEBP') or image.width * image.height > 16_000_000:
                raise ValueError()
            image = ImageOps.exif_transpose(image).convert('RGBA')
            image.thumbnail((2048, 2048))
            out = io.BytesIO(); image.save(out, format='PNG')
            normalized = out.getvalue(); width, height = image.size
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        raise HTTPException(422, '16MP以下のPNG・JPEG・WebPを指定してください')
    digest = hashlib.sha256(normalized + name.encode() + source.encode()).hexdigest()
    identity = digest[:32]
    async with library_lock:
        directory = folder('assets'); path = directory / (identity + '.json')
        if path.exists():
            return metadata('assets', identity)
        if len(list(directory.glob('*.json'))) >= 200:
            raise HTTPException(409, '演出画像の登録上限は200枚です')
        entry = dict(id=identity, name=name, source=source, width=width, height=height,
                     url=f'/api/stage/assets/{identity}/image', created=time.time(), sha256=hashlib.sha256(normalized).hexdigest())
        (directory / (identity + '.png')).write_bytes(normalized)
        write_json(path, entry)
        return entry


@router.get('/assets/{aid}/image')
def asset_image(aid: str):
    metadata('assets', aid)
    return FileResponse(folder('assets') / (aid + '.png'), media_type='image/png')


@router.post('/presets', status_code=201)
async def save_preset(body: SavePreset):
    check_assets([step.scene for step in body.recipe.steps])
    identity = hashlib.sha256(body.request_id.encode()).hexdigest()[:32]
    async with library_lock:
        path = folder('presets') / (identity + '.json')
        if path.exists():
            old = metadata('presets', identity)
            if old['recipe'] != body.recipe.model_dump():
                raise HTTPException(409, '同じrequest_idが別のプリセットに使われています')
            return old
        if len(list(folder('presets').glob('*.json'))) >= 100:
            raise HTTPException(409, '演技プリセットの登録上限は100件です')
        value = dict(id=identity, request_id=body.request_id, recipe=body.recipe.model_dump(), created=time.time())
        write_json(path, value)
        return value


@router.get('/presets/{pid}')
def preset(pid: str):
    return metadata('presets', pid)


@router.get('/sessions/{sid}')
def state(sid: str):
    from .runtime import get
    s = get(sid); expire(s)
    return dict(**s.stage, preview_url=f'/api/stage/sessions/{sid}/preview')


@router.put('/sessions/{sid}')
async def configure(sid: str, body: StageUpdate):
    from .runtime import get
    s = get(sid)
    if body.baseline:
        check_assets([body.baseline])
        check_colors([body.baseline], s.project)
    async with s.lock:
        expire(s)
        if body.revision != s.stage['revision']:
            raise HTTPException(409, '演出設定が更新されています。読み直してください')
        reset(s)
        s.stage['mode'] = body.mode
        if body.baseline:
            s.stage['baseline'] = body.baseline.model_dump()
        await publish(s)
        return s.stage


@router.post('/sessions/{sid}/perform', status_code=202)
async def perform(sid: str, body: Perform):
    from .runtime import get
    s = get(sid)
    async with s.lock:
        expire(s)
        previous = s.performances.get(body.request_id)
        if previous:
            if previous['command'] != body.model_dump():
                raise HTTPException(409, '同じrequest_idを別の演技に使えません')
            return previous
        if not s.status()['connected'] or s.stage['mode'] != 'ai':
            raise HTTPException(409, '出力を接続し「AIに任せる」を有効にしてください')
        if body.revision != s.stage['revision']:
            raise HTTPException(409, '演出設定が更新されています。読み直してください')
        if body.recipe.until_speech_end and not s.current:
            raise HTTPException(409, '発話連動の演技は発話中に開始してください')
        check_assets([step.scene for step in body.recipe.steps])
        check_colors([step.scene for step in body.recipe.steps], s.project)
        reset(s)
        item = dict(request_id=body.request_id, command=body.model_dump(), status='accepted', created=time.time(),
                    result_url=f'/api/stage/sessions/{sid}/perform/{body.request_id}')
        s.performances[body.request_id] = item
        while len(s.performances) > 100:
            s.performances.popitem(last=False)
        s.stage['active'] = dict(request_id=body.request_id, recipe=body.recipe.model_dump(), started_at=None)
        try:
            await publish(s)
        except (RuntimeError, asyncio.TimeoutError):
            item.update(status='unknown', error='送信結果を確認できません')
        return item


@router.get('/sessions/{sid}/perform/{request_id}')
def result(sid: str, request_id: str):
    from .runtime import get
    s = get(sid); expire(s)
    if request_id not in s.performances:
        raise HTTPException(404, '演技の結果がありません（直近100件・再起動で消去）')
    return s.performances[request_id]


async def acknowledge(s, msg):
    active = s.stage['active']
    if not active or active['request_id'] != msg.get('request_id'):
        return
    item = s.performances[active['request_id']]
    phase = msg.get('status')
    if phase == 'running' and item['status'] == 'accepted':
        # Server stamps the shared clock only after assets have loaded and a frame rendered.
        active['started_at'] = time.time()
        item.update(status='running', started_at=active['started_at'])
    elif phase in ('completed', 'interrupted', 'failed'):
        reset(s, phase)
        if phase == 'failed':
            item['error'] = str(msg.get('error', '描画できませんでした'))[:500]
    else:
        return
    await publish(s)


@router.get('/sessions/{sid}/preview')
async def preview(sid: str):
    from .runtime import get
    s = get(sid)
    if not s.status()['connected']:
        raise HTTPException(409, '出力が接続されていません')
    if len(s.stage_captures) >= 2:
        raise HTTPException(429, '確認画像の描画を待ってください')
    identity = uuid.uuid4().hex
    future = asyncio.get_running_loop().create_future()
    s.stage_captures[identity] = future
    try:
        await s.send(dict(type='stage_capture', id=identity))
        raw = await asyncio.wait_for(future, 10)
        return Response(raw, media_type='image/png', headers={'Cache-Control':'no-store'})
    except (asyncio.TimeoutError, RuntimeError):
        raise HTTPException(504, '出力から確認画像が届きませんでした')
    finally:
        s.stage_captures.pop(identity, None)


@router.post('/sessions/{sid}/preview/{cid}', include_in_schema=False)
async def receive_preview(sid: str, cid: str, file: UploadFile = File(...)):
    from .runtime import get
    s = get(sid); future = s.stage_captures.get(cid)
    if not future or future.done():
        raise HTTPException(404, '確認画像の要求がありません')
    raw = await file.read(2 * 1024**2 + 1)
    if len(raw) > 2 * 1024**2:
        raise HTTPException(413, '確認画像が大きすぎます')
    try:
        with Image.open(io.BytesIO(raw)) as image:
            if image.format != 'PNG' or max(image.size) > 1024:
                raise ValueError()
            image.load()
    except (ValueError, OSError, Image.DecompressionBombError):
        raise HTTPException(422, '確認画像の形式が不正です')
    future.set_result(raw)
    return dict(ok=True)
