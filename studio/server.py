from __future__ import annotations

import io
import json
import os
import shutil
import subprocess
import threading
import uuid
import zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlparse
from typing import Literal

import httpx
import imageio_ffmpeg
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware
from pydantic import BaseModel, Field, SecretStr

from .convert import convert_file, PRESETS
from .hybrid import convert_hybrid
from .eyelids import attach_closed_lashes

from .paths import ROOT, DATA
PROJECTS = DATA / 'projects'
UPLOADS = DATA / 'uploads'
EXPORTS = DATA / 'exports'
for directory in (PROJECTS, UPLOADS, EXPORTS):
    directory.mkdir(parents=True, exist_ok=True)
SAMPLE = Path(r'E:\other_repo\see-through-webui\workspace\webui_output\00001-709794526_1788444876\00001-709794526.psd')
MAX_UPLOAD = 100 * 1024**2
pool = ThreadPoolExecutor(max_workers=1)
jobs = {}
lock = threading.Lock()
app = FastAPI(title='SVG-Through Motion', docs_url='/api/docs')
from .materials import router as materials_router
app.include_router(materials_router)
from .material_inference import router as material_inference_router
app.include_router(material_inference_router)
from .loop_export import router as loop_export_router
app.include_router(loop_export_router)
from .integration_export import router as integration_export_router
app.include_router(integration_export_router)
from .control import router as control_router
app.include_router(control_router)
from .assist import router as assist_router
app.include_router(assist_router)
from .runtime import router as runtime_router
app.include_router(runtime_router)
from .desktop import router as desktop_router
app.include_router(desktop_router)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=['127.0.0.1', 'localhost', '[::1]', 'testserver'])


@app.middleware('http')
async def same_origin(request: Request, call_next):
    origin = request.headers.get('origin')
    if origin and origin != str(request.base_url).rstrip('/'):
        return JSONResponse({'detail': '同じアプリ画面から操作してください'}, status_code=403)
    response = await call_next(request)
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Referrer-Policy'] = 'no-referrer'
    response.headers['X-Frame-Options'] = 'SAMEORIGIN'
    if request.url.path=='/' or request.url.path.startswith('/web/'):
        response.headers['Cache-Control'] = 'no-cache'
    return response


def project_dir(pid):
    if not isinstance(pid, str) or not __import__('re').fullmatch(r'[a-f0-9]{32}', pid):
        raise HTTPException(404, 'プロジェクトが見つかりません')
    path = PROJECTS / pid
    if not (path / 'project.json').exists():
        raise HTTPException(404, 'プロジェクトが見つかりません')
    return path


def space_guard():
    if shutil.disk_usage(DATA).free < 2 * 1024**3:
        raise HTTPException(507, '空き容量が2GB未満のため変換を停止しました')


def start_job(source, preset, cleanup, alpha, original=None, motion_parts=False, source_open=False, face_donors=None, before_start=None, depth_psd=None):
    if preset not in PRESETS or not 0 <= alpha <= 128:
        raise HTTPException(422, '変換設定が範囲外です')
    space_guard()
    with lock:
        if any(j['state'] in ('queued', 'running') for j in jobs.values()):
            raise HTTPException(409, '変換中です。完了後に次の素材を読み込んでください')
        jid = uuid.uuid4().hex
        if before_start:before_start(jid)
        jobs[jid] = dict(id=jid, state='queued', progress=0, message='準備中')

    def work():
        jobs[jid]['state'] = 'running'
        def progress(value, message):
            jobs[jid].update(progress=value, message=message)
        try:
            if original is None:
                convert_file(source, PROJECTS / jid, preset, cleanup, alpha, progress, source_open=source_open)
            else:
                convert_hybrid(source, original, PROJECTS / jid, preset, cleanup, alpha, progress, motion_parts=motion_parts, source_open=source_open, face_donors=face_donors, depth_psd=depth_psd)
            jobs[jid].update(state='done', projectId=jid)
        except Exception as exc:
            jobs[jid].update(state='error', message=f'変換できませんでした: {exc}')
    pool.submit(work)
    return dict(jobId=jid)


@app.get('/api/health')
def health():
    return dict(ok=True, sampleAvailable=False, presets=list(PRESETS), version='0.1.0', faceDonorImport=True, depthImport=True, artworkSourceChoices=True, ttsEngines=['sbv2','voicevox','aivis','irodori','browser'])


@app.post('/api/exports/{name}')
async def save_export(name: str, request: Request):
    import re
    if not re.fullmatch(r'[a-zA-Z0-9_.-]{1,80}', name) or Path(name).suffix not in ('.svg','.png','.webm','.wav','.zip','.json'):
        raise HTTPException(422, '書き出しファイル名が不正です')
    space_guard()
    eid=uuid.uuid4().hex
    directory=EXPORTS/eid
    directory.mkdir()
    size=0
    with (directory/name).open('xb') as f:
        async for chunk in request.stream():
            size+=len(chunk)
            if size>200*1024**2:
                raise HTTPException(413, '書き出しは200MB以下にしてください')
            f.write(chunk)
    if not size:
        raise HTTPException(422, '書き出し内容が空です')
    return dict(url=f'/api/exports/{eid}/{name}', path=str(directory/name), bytes=size)


@app.get('/api/exports/{eid}/{name}')
def get_export(eid: str, name: str):
    import re
    if not re.fullmatch(r'[a-f0-9]{32}',eid) or not re.fullmatch(r'[a-zA-Z0-9_.-]{1,80}',name):
        raise HTTPException(404, 'ファイルが見つかりません')
    path=EXPORTS/eid/name
    # Both generations of saved links remain usable without renaming user files.
    project_names=('svg-through-motion.project.json', 'khaula-motion.project.json')
    if not path.is_file() and name in project_names:
        path=EXPORTS/eid/project_names[1-project_names.index(name)]
    if not path.is_file():
        raise HTTPException(404, 'ファイルが見つかりません')
    return FileResponse(path, filename=name)


@app.post('/api/exports/{eid}/{name}/reveal')
def reveal_export(eid: str, name: str):
    import re
    if not re.fullmatch(r'[a-f0-9]{32}', eid) or not re.fullmatch(r'[a-zA-Z0-9_.-]{1,80}', name):
        raise HTTPException(404, '保存したファイルが見つかりません。')
    directory = (EXPORTS / eid).resolve()
    path = (directory / name).resolve()
    if not directory.is_relative_to(EXPORTS.resolve()) or path.parent != directory or not path.is_file():
        raise HTTPException(404, '保存したファイルが見つかりません。')
    if os.name != 'nt':
        raise HTTPException(501, 'この環境では保存先フォルダを開けません。')
    try:
        subprocess.Popen([str(Path(os.environ.get('SystemRoot', r'C:\Windows')) / 'explorer.exe'),
                          '/select,', str(path)], shell=False)
    except OSError as exc:
        raise HTTPException(502, '保存先フォルダを開けませんでした。もう一度お試しください。') from exc
    return dict(opened=True)


@app.post('/api/exports/{eid}/{name}/mp4')
def export_mp4(eid: str, name: str):
    import re
    if not re.fullmatch(r'[a-f0-9]{32}', eid) or not re.fullmatch(r'[a-zA-Z0-9_.-]{1,75}\.webm', name):
        raise HTTPException(404, '変換するWebMが見つかりません')
    source = EXPORTS / eid / name
    if not source.is_file():
        raise HTTPException(404, '変換するWebMが見つかりません')
    space_guard()
    output_id = uuid.uuid4().hex
    directory = EXPORTS / output_id
    directory.mkdir()
    output = directory / 'svg-through-motion.mp4'
    try:
        result = subprocess.run([
            imageio_ffmpeg.get_ffmpeg_exe(), '-nostdin', '-hide_banner', '-loglevel', 'error',
            '-i', str(source), '-vf',
            'scale=1080:1350:force_original_aspect_ratio=decrease:flags=lanczos,pad=1080:1350:(ow-iw)/2:(oh-ih)/2:color=white,fps=30',
            '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p',
            '-c:a', 'aac', '-movflags', '+faststart', str(output)
        ], capture_output=True, timeout=180, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise HTTPException(502, f'MP4変換を完了できませんでした: {exc}')
    if result.returncode or not output.is_file():
        raise HTTPException(422, 'WebMをMP4に変換できませんでした。録画をやり直してください。')
    return dict(url=f'/api/exports/{output_id}/{output.name}', path=str(output), bytes=output.stat().st_size)


@app.post('/api/exports/{eid}/{name}/loop-mp4')
def export_loop_mp4(eid: str, name: str):
    import re
    from PIL import Image
    if not re.fullmatch(r'[a-f0-9]{32}', eid) or name not in ('khaula-frames.zip', 'svg-through-frames.zip'):
        raise HTTPException(404, '動画フレームが見つかりません')
    source = EXPORTS / eid / name
    if not source.is_file():
        raise HTTPException(404, '動画フレームが見つかりません')
    space_guard()
    output_id = uuid.uuid4().hex
    directory = EXPORTS / output_id
    frames_dir = directory / 'frames'
    frames_dir.mkdir(parents=True)
    try:
        with zipfile.ZipFile(source) as archive:
            entries = archive.infolist()
            if not 1 <= len(entries) <= 900 or sum(e.file_size for e in entries) > 200 * 1024**2:
                raise ValueError('動画フレーム数または容量が範囲外です')
            size = None
            extension = Path(entries[0].filename).suffix
            if extension not in ('.png','.jpg'):
                raise ValueError('動画フレームはPNGまたはJPEGが必要です')
            for i, entry in enumerate(entries):
                if entry.filename != f'frame{i:06d}{extension}' or entry.file_size > 8*1024**2:
                    raise ValueError('動画フレームの並びが不正です')
                data = archive.read(entry)
                with Image.open(io.BytesIO(data)) as im:
                    if im.format != ("PNG" if extension=='.png' else "JPEG") or max(im.size) > 1080 or (size and im.size != size):
                        raise ValueError('動画フレームの画像サイズが不正です')
                    size = im.size
                with (frames_dir / entry.filename).open('xb') as f:
                    f.write(data)
    except (ValueError, OSError, zipfile.BadZipFile, RuntimeError) as exc:
        raise HTTPException(422, f'動画フレームを読み込めません: {exc}')
    output = directory / 'svg-through-motion.mp4'
    try:
        result = subprocess.run([
            imageio_ffmpeg.get_ffmpeg_exe(), '-nostdin', '-hide_banner', '-loglevel', 'error',
            '-framerate', '30', '-i', str(frames_dir / f'frame%06d{extension}'), '-vf',
            'scale=1080:1350:force_original_aspect_ratio=decrease:flags=lanczos,pad=1080:1350:(ow-iw)/2:(oh-ih)/2:color=white',
            '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart', str(output)
        ], capture_output=True, timeout=180, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise HTTPException(502, f'MP4変換を完了できませんでした: {exc}')
    if result.returncode or not output.is_file():
        raise HTTPException(422, 'MP4に変換できませんでした')
    return dict(url=f'/api/exports/{output_id}/{output.name}', path=str(output), bytes=output.stat().st_size, frames=len(entries))


@app.get('/api/projects')
def projects():
    result = []
    for p in sorted(PROJECTS.glob('*/project.json'), key=lambda p: p.stat().st_mtime, reverse=True):
        try:
            meta = json.loads(p.read_text(encoding='utf-8'))
            result.append(dict(id=meta['id'], name=meta['name'], parts=len(meta['parts'])))
        except (ValueError, KeyError):
            continue
    return result


@app.get('/api/projects/{pid}')
def get_project(pid: str):
    path = project_dir(pid)
    project = json.loads((path / 'project.json').read_text(encoding='utf-8'))
    attach_closed_lashes(project,path)
    from .mouths import attach_closed_mouths
    attach_closed_mouths(project,path)
    # Old converted hybrids have no mode. Use the restrained default on reopen;
    # keep their on-disk files intact and leave explicitly saved modes untouched.
    if project.get('conversion', {}).get('mode') == 'hybrid' and 'rigMode' not in project.get('settings', {}):
        settings = project.setdefault('settings', {})
        settings['rigMode'] = 'stable'
        for key, limit in dict(headTilt=1.2, headYaw=.15, headNod=.5, bodyFollow=.2, hairBend=3, sway=.3, breathe=1).items():
            settings[key] = min(settings.get(key, limit), limit)
    for part in project['parts']:
        part['svgText'] = (path / part['svg']).read_text(encoding='utf-8')
        part['originalUrl'] = f"/assets/{pid}/{part['original']}"
    project['sourceUrl'] = f'/assets/{pid}/source.png'
    project['reconstructedUrl'] = f'/assets/{pid}/reconstructed.png'
    return project


@app.get('/api/projects/{pid}/bundle')
def bundle(pid: str):
    path = project_dir(pid)
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, 'w', zipfile.ZIP_DEFLATED) as z:
        for file in path.rglob('*'):
            if file.is_file() and 'work' not in file.relative_to(path).parts:
                z.write(file, file.relative_to(path).as_posix())
    return Response(stream.getvalue(), media_type='application/zip',
                    headers={'Content-Disposition': 'attachment; filename="svg-parts.zip"'})


@app.get('/api/jobs/{jid}')
def job(jid: str):
    if jid not in jobs:
        raise HTTPException(404, '変換ジョブが見つかりません')
    return jobs[jid]


@app.post('/api/import/sample')
def import_sample(preset: str = Form('balanced'), cleanup: bool = Form(False), alpha: int = Form(12)):
    raise HTTPException(422, '旧サンプルは閉じ口です。目と口が開いた元画像と対応するPSDを読み込んでください。')


@app.post('/api/import/hybrid/sample')
def import_hybrid_sample(preset: str = Form('balanced'), cleanup: bool = Form(True), alpha: int = Form(12), motion_parts: bool = Form(False), open_features: bool = Form(False)):
    raise HTTPException(422, '旧サンプルは閉じ口です。目と口が開いた元画像と対応するPSDを読み込んでください。')


@app.post('/api/import/hybrid')
async def import_hybrid_files(psd: UploadFile = File(...), original: UploadFile = File(...), depth_psd: UploadFile | None = File(None),
                              preset: str = Form('balanced'), cleanup: bool = Form(True), alpha: int = Form(12), motion_parts: bool = Form(False), open_features: bool = Form(False),
                              eyes_closed: UploadFile | None = File(None), mouth_closed: UploadFile | None = File(None),
                              mouth_a: UploadFile | None = File(None), mouth_i: UploadFile | None = File(None), mouth_u: UploadFile | None = File(None),
                              mouth_e: UploadFile | None = File(None), mouth_o: UploadFile | None = File(None), defer: bool=Form(False), assist_wish: str=Form(''), assist_generation: bool=Form(False)):
    if Path(psd.filename or '').suffix.lower() != '.psd' or Path(original.filename or '').suffix.lower() not in ('.png','.jpg','.jpeg','.webp'):
        raise HTTPException(415, 'PSDと、その元画像（PNG・JPEG・WebP）を選んでください')
    if not open_features:
        raise HTTPException(422, '両目と口が開いている元絵を選び、入力条件を確認してください。自動判定は行いません。')
    if depth_psd is not None and Path(depth_psd.filename or '').suffix.lower() != '.psd':
        raise HTTPException(415, 'Depthは通常素材と対応するDepth PSDを選んでください')
    donors = {k: v for k, v in dict(eyes_closed=eyes_closed, mouth_closed=mouth_closed, a=mouth_a, i=mouth_i, u=mouth_u, e=mouth_e, o=mouth_o).items() if v is not None}
    if any(Path(f.filename or '').suffix.lower() != '.psd' for f in donors.values()):
        raise HTTPException(415, '目・口の追加差分はPSDを指定してください')
    if preset not in PRESETS or not 0 <= alpha <= 128:
        raise HTTPException(422, '変換設定が範囲外です')
    space_guard()
    directory = UPLOADS / uuid.uuid4().hex
    directory.mkdir()
    targets = []
    for upload, stem in [(psd, 'face'), (original, 'original')] + [(f, 'donor-' + k) for k, f in donors.items()] + ([(depth_psd, 'depth')] if depth_psd is not None else []):
        target = directory / (stem + Path(upload.filename).suffix.lower())
        size = 0
        with target.open('xb') as f:
            while chunk := await upload.read(1024**2):
                size += len(chunk)
                if size > MAX_UPLOAD:
                    raise HTTPException(413, '各ファイルは100MB以下にしてください')
                f.write(chunk)
        targets.append(target)
    if defer:
        from .assist import register_input
        return register_input(targets,dict(preset=preset,cleanup=cleanup,alpha=alpha,motion_parts=motion_parts,source_open=True),donors,dict(wish=assist_wish[:2000],allow_generation=assist_generation),depth_index=len(targets)-1 if depth_psd is not None else None)
    return start_job(targets[0], preset, cleanup, alpha, targets[1], motion_parts, source_open=True, face_donors=dict(zip(donors, targets[2:2+len(donors)])), depth_psd=targets[-1] if depth_psd is not None else None)


@app.post('/api/import')
async def import_file(file: UploadFile = File(...), preset: str = Form('balanced'),
                      cleanup: bool = Form(False), alpha: int = Form(12), open_features: bool = Form(False)):
    extension = Path(file.filename or '').suffix.lower()
    if extension not in ('.psd', '.png', '.jpg', '.jpeg', '.webp'):
        raise HTTPException(415, 'PSD / PNG / JPEG / WebPを選んでください')
    if not open_features:
        raise HTTPException(422, '両目と口が開いている元絵を選び、入力条件を確認してください。自動判定は行いません。')
    space_guard()
    with lock:
        if any(j['state'] in ('queued', 'running') for j in jobs.values()):
            raise HTTPException(409, '変換中です')
    upload_dir = UPLOADS / uuid.uuid4().hex
    upload_dir.mkdir()
    # Retain uploads for reproducibility. Never use a client-supplied filesystem path.
    safe_name = Path((file.filename or 'image').replace('\\', '/')).name
    import re
    safe_name = re.sub(r'[^\w. -]', '_', safe_name)[:100]
    if not safe_name.lower().endswith(extension):
        safe_name = 'source' + extension
    target = upload_dir / safe_name
    size = 0
    with target.open('xb') as f:
        while chunk := await file.read(1024**2):
            size += len(chunk)
            if size > MAX_UPLOAD:
                raise HTTPException(413, 'アップロードは100MB以下にしてください')
            f.write(chunk)
    if not size:
        raise HTTPException(422, 'ファイルが空です')
    return start_job(target, preset, cleanup, alpha, source_open=True)


class TTSRequest(BaseModel):
    engine: Literal['sbv2', 'voicevox', 'aivis', 'irodori'] = 'sbv2'
    model: str = Field('irodori-tts', min_length=1, max_length=200)
    voice: str = Field('', max_length=200)
    api_key: SecretStr = Field(default=SecretStr(''), exclude=True)
    base_url: str = 'http://127.0.0.1:5002'
    text: str = Field('', max_length=200)
    model_id: int = Field(0, ge=0)
    speaker_id: int = Field(0, ge=0)
    style: str = Field('Neutral', max_length=100)
    style_weight: float = Field(1.0, ge=0, le=10)
    length: float = Field(1.0, ge=.5, le=2)


def tts_base(value):
    parsed = urlparse(value)
    try:
        port = parsed.port
    except ValueError:
        raise HTTPException(422, 'ポート番号が不正です')
    if parsed.scheme != 'http' or parsed.hostname not in ('localhost', '127.0.0.1', '::1') or parsed.username or parsed.password or parsed.path not in ('', '/') or parsed.query or parsed.fragment:
        raise HTTPException(422, 'TTS接続先はローカルのhttp://127.0.0.1:ポートを指定してください')
    return value.rstrip('/')


async def tts_request(body, route, params=None, *, method=None, json_body=None):
    value = (body.base_url if 'base_url' in body.model_fields_set else TTS_URLS[body.engine]).rstrip('/')
    if body.engine == 'irodori' and value.endswith('/v1'):
        value = value[:-3]
    base = tts_base(value)
    key = body.api_key.get_secret_value() if body.engine == 'irodori' else ''
    if any(c in key for c in '\r\n'):
        raise HTTPException(422, 'APIキーが不正です')
    headers = {'Authorization': 'Bearer ' + key} if key else {}
    try:
        async with httpx.AsyncClient(timeout=180, trust_env=False, follow_redirects=False) as client:
            result = await client.request(method or ('POST' if route == '/voice' else 'GET'), base + route, params=params, json=json_body, headers=headers)
            result.raise_for_status()
            return result
    except httpx.ConnectError:
        raise HTTPException(502, f"{TTS_NAMES[body.engine]}に接続できません。{'server_fastapi.py' if body.engine == 'sbv2' else '音声エンジン'}を起動し、接続URLを確認してください。")
    except httpx.TimeoutException:
        raise HTTPException(504, '音声生成がタイムアウトしました。TTSサーバーの状態を確認してください。')
    except httpx.HTTPError as exc:
        code = exc.response.status_code if isinstance(exc, httpx.HTTPStatusError) else None
        detail = '認証キーを確認してください。' if code in (401, 403) else '接続先・選択した声・音声エンジンの状態を確認してください。'
        raise HTTPException(502, f'TTSサーバーの応答エラー（{code or type(exc).__name__}）。{detail}')


TTS_URLS = {'sbv2': 'http://127.0.0.1:5002', 'voicevox': 'http://127.0.0.1:50021', 'aivis': 'http://127.0.0.1:10101', 'irodori': 'http://127.0.0.1:8088'}
TTS_NAMES = {'sbv2': 'Style-Bert-VITS2', 'voicevox': 'VOICEVOX', 'aivis': 'AivisSpeech', 'irodori': 'Irodori-TTS'}


def json_result(result):
    try:
        return result.json()
    except ValueError:
        raise HTTPException(502, '音声エンジンからJSONが返りませんでした')


@app.post('/api/tts/voices')
async def tts_voices(body: TTSRequest):
    voices = []
    try:
        if body.engine == 'sbv2':
            models = json_result(await tts_request(body, '/models/info'))
            for mid, model in models.items():
                name = str(model.get('model_path', f'モデル {mid}')).replace('\\', '/').split('/')[-1]
                for speaker, sid in model.get('spk2id', {}).items():
                    for style in model.get('style2id', {'Neutral': 0}):
                        voices.append(dict(label=f'{name} / {speaker} / {style}', model_id=int(mid), speaker_id=int(sid), style=style))
        elif body.engine in ('voicevox', 'aivis'):
            for speaker in json_result(await tts_request(body, '/speakers')):
                for style in speaker['styles']:
                    if style.get('type', 'talk') != 'talk':
                        continue
                    voices.append(dict(label=f"{speaker['name']} / {style['name']}", speaker_id=int(style['id'])))
        else:
            models = json_result(await tts_request(body, '/v1/models'))['data']
            items = json_result(await tts_request(body, '/v1/audio/voices'))['data']
            for model in models:
                for voice in items:
                    voices.append(dict(label=str(voice['id']), model=str(model['id']), voice=str(voice['id'])))
    except (KeyError, TypeError, ValueError, AttributeError):
        raise HTTPException(502, '声の一覧が対応するAPI形式ではありません。エンジンとURLを確認してください')
    return dict(engine=body.engine, voices=voices)


@app.post('/api/tts/models')
async def tts_models(body: TTSRequest):
    result = await tts_request(body, '/models/info')
    try:
        return result.json()
    except ValueError:
        raise HTTPException(502, 'モデル一覧をJSONで取得できませんでした')


@app.post('/api/tts/synthesize')
async def synthesize(body: TTSRequest):
    if not body.text.strip():
        raise HTTPException(422, '読み上げるテキストを入力してください')
    if body.engine in ('voicevox', 'aivis'):
        query = json_result(await tts_request(body, '/audio_query', {'text': body.text, 'speaker': body.speaker_id}, method='POST'))
        if not isinstance(query, dict) or 'accent_phrases' not in query:
            raise HTTPException(502, '音声クエリの形式が不正です')
        result = await tts_request(body, '/synthesis', {'speaker': body.speaker_id}, method='POST', json_body=query)
    elif body.engine == 'irodori':
        payload = dict(model=body.model, input=body.text, response_format='wav', speed=1/body.length)
        if body.voice:
            payload['voice'] = body.voice
        result = await tts_request(body, '/v1/audio/speech', method='POST', json_body=payload)
    else:
        params = body.model_dump(include={'text','model_id','speaker_id','style','style_weight','length'})
        params.update(language='JP', auto_split='true')
        result = await tts_request(body, '/voice', params)
    if result.content[:4] != b'RIFF' or result.content[8:12] != b'WAVE':
        raise HTTPException(502, 'TTSからWAV音声が返りませんでした')
    return Response(result.content, media_type='audio/wav')


@app.get('/')
def index():
    return FileResponse(ROOT / 'web' / 'index.html')


app.mount('/assets', StaticFiles(directory=PROJECTS), name='assets')
app.mount('/web', StaticFiles(directory=ROOT / 'web'), name='web')
