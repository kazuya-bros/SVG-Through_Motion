"""Offline RIFE references -> a small, common-topology SVG deformation grid."""
import base64
import hashlib
import importlib.util
import io
import json
import os
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Literal

import numpy as np
from PIL import Image
from scipy.ndimage import median_filter
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from .paths import ROOT
from .rife_keyframes import RifeRunner

router = APIRouter(prefix='/api/rife-morph', tags=['RIFE vector keyframes'])
pool = ThreadPoolExecutor(max_workers=1)
lock = threading.Lock()
jobs = {}
BACKGROUND = (128, 255, 128)


def model_path():
    override = os.environ.get('SVG_THROUGH_RIFE_MODEL')
    candidates = [Path(override)] if override else [ROOT/'models/rife.onnx', ROOT/'.desktop-build/models/rife.onnx']
    return next((p for p in candidates if p.is_file()), candidates[0])


@router.get('/status')
def status():
    ready = model_path().is_file() and importlib.util.find_spec('onnxruntime') is not None
    return {'available': ready, 'offline': True, 'playback_requires_rife': False,
            'active_jobs': [dict(id=j['id'], status=j['status'], progress=j['progress']) for j in list(jobs.values()) if j.get('_working')],
            'message': '利用できます' if ready else 'RIFEモデルとONNX Runtimeを含むデスクトップ版が必要です'}


class Generate(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    request_id: str = Field(pattern=r'^[a-zA-Z0-9_-]{1,80}$')
    kind: Literal['eye', 'mouth']
    mode: Literal['grid', 'svg-frames'] = 'grid'
    start: str = Field(max_length=1200000)
    end: str = Field(max_length=1200000)
    anchor: float = Field(ge=-2, le=3)


def decode(value, preserve_alpha=False):
    prefix = 'data:image/png;base64,'
    if not value.startswith(prefix):
        raise ValueError('PNG data URLが必要です')
    image = Image.open(io.BytesIO(base64.b64decode(value[len(prefix):], validate=True)))
    if image.format != 'PNG' or min(image.size) < 16 or max(image.size) > 384:
        raise ValueError('入力画像は16〜384pxのPNGにしてください')
    image.load()
    rgba = image.convert('RGBA')
    if preserve_alpha:
        return rgba
    result = Image.new('RGB', image.size, BACKGROUND)
    result.paste(rgba, mask=rgba.getchannel('A'))
    return result


def profile(image):
    rgb = np.asarray(image, dtype=float)
    mask = np.linalg.norm(rgb-np.array(BACKGROUND), axis=2) > 35
    h, w = mask.shape
    columns = np.flatnonzero(mask.any(axis=0))
    if len(columns) < 8:
        raise ValueError('輪郭を抽出できません。開閉差分を確認してください')
    top = np.array([np.flatnonzero(mask[:, x])[0] for x in columns], dtype=float)
    bottom = np.array([np.flatnonzero(mask[:, x])[-1]+1 for x in columns], dtype=float)
    top, bottom = median_filter(top, size=5), median_filter(bottom, size=5)
    # Empty edge columns inherit the nearest observed boundary.
    x = np.linspace(0, w-1, 5)
    return np.array([np.interp(x, columns, top), np.interp(x, columns, bottom)])/h


def fit_frames(profiles, kind, anchor):
    """Fit vertical mesh coordinates; exact old-renderer endpoints are retained.

    Only the residual contour change comes from RIFE. This avoids baking a
    different endpoint pose or RIFE's crossfade into the user's source artwork.
    """
    profiles = np.asarray(profiles)
    times = np.linspace(0, 1, 5)
    if kind == 'eye':
        gaps = np.mean(profiles[:, 1]-profiles[:, 0], axis=1)
        span = gaps[0]-gaps[-1]
        if span < .025:
            raise ValueError('開いた目と閉じた目の差が小さすぎます。閉じ目を確認してください')
        closure = np.maximum.accumulate(np.clip((gaps[0]-gaps)/span, 0, 1))
        closure[0], closure[-1] = 0, 1
        # Invert measured closure, preventing RIFE from closing prematurely.
        indexes = np.r_[True, np.diff(closure) > 1e-6]
        sample_times = np.interp(times, closure[indexes], times[indexes])
        sample_times[0], sample_times[-1] = 0, 1
    else:
        sample_times = times
    original = profiles[0 if kind == 'eye' else -1]
    span = np.maximum(original[1]-original[0], .04)
    frames = []
    for index, (at, sample) in enumerate(zip(times, sample_times)):
        scale = max(.025, 1-at) if kind == 'eye' else .045+.955*at
        base = anchor+(np.array([0, 1])[:, None]-anchor)*scale
        baseline_profile = profiles[0]*(1-at)+profiles[-1]*at
        observed = np.array([[np.interp(sample, times, profiles[:, row, col]) for col in range(5)] for row in range(2)])
        residual = np.clip(observed-baseline_profile, -.16, .16)
        if index in (0, 4):
            residual[:] = 0
        # Extrapolate the measured contour displacement to the outer grid.
        dy_scale = (residual[1]-residual[0])/span
        dy_offset = residual[0]-dy_scale*original[0]
        ys = base + dy_offset + np.array([0, 1])[:, None]*dy_scale
        # Limit local folding and extreme stretch, retaining small end apertures.
        middle = (ys[0]+ys[1])/2
        height = np.clip(ys[1]-ys[0], max(.015, scale*.4), min(1.5, scale*1.8))
        ys = np.array([middle-height/2, middle+height/2])
        if index not in (0, 4):
            # The outer nodes sit in transparent padding, where a one-pixel
            # lash/outline gives an unstable scale estimate. Extend its neighbor.
            ys[:, 0], ys[:, 4] = ys[:, 1].copy(), ys[:, 3].copy()
        frames.append({'at': float(at), 'ys': np.round(ys, 6).ravel().tolist()})
    first, last = np.array(frames[0]['ys']), np.array(frames[-1]['ys'])
    previous = first.copy()
    for frame in frames[1:-1]:
        current = np.array(frame['ys'])
        current = np.clip(current, np.minimum(previous, last), np.maximum(previous, last))
        frame['ys'] = current.tolist()
        previous = current
    return frames


def encode(image):
    stream = io.BytesIO()
    image.save(stream, format='PNG')
    return 'data:image/png;base64,'+base64.b64encode(stream.getvalue()).decode()


def run(jid, spec, start, end):
    try:
        runner = RifeRunner(model_path(), with_alpha=spec.mode == 'svg-frames')
        def progress(value, message):
            with lock:
                if jobs[jid]['status'] == 'cancelled':
                    raise ValueError('中止しました')
                jobs[jid].update(status='running', progress=value, message=message)
        rgba_start, rgba_end = start, end
        if spec.mode == 'svg-frames':
            from .rife_sequence import composite, generate_sequence
            start, end = composite(start, BACKGROUND), composite(end, BACKGROUND)
        profiles, references = [], []
        for index, at in enumerate((0, .25, .5, .75, 1)):
            with lock:
                if jobs[jid]['status'] == 'cancelled':
                    return
                jobs[jid].update(status='running', progress=index/5*(.3 if spec.mode == 'svg-frames' else 1), message=f'開閉タイミング {index+1}/5')
            image, _ = runner.interpolate(start, end, at)
            profiles.append(profile(image))
            references.append(encode(image))
        frames = fit_frames(profiles, spec.kind, spec.anchor)
        result = {'frames': frames, 'references': references, 'timing_corrected': spec.kind == 'eye', 'mode': 'grid'}
        if spec.mode == 'svg-frames':
            result.update(generate_sequence(runner, rgba_start, rgba_end, spec.kind, profiles, progress, encode))
        with lock:
            if jobs[jid]['status'] != 'cancelled':
                jobs[jid].update(status='done', progress=1, message='中間形状を生成しました', result=result)
    except Exception as error:
        with lock:
            if jobs[jid]['status'] != 'cancelled':
                jobs[jid].update(status='failed', message=str(error)[:500])
    finally:
        with lock:
            jobs[jid]['_working'] = False


@router.post('/jobs', status_code=202)
def generate(spec: Generate):
    digest = hashlib.sha256(json.dumps(spec.model_dump(), sort_keys=True).encode()).hexdigest()
    with lock:
        previous = next((item for item in jobs.values() if item['request_id'] == spec.request_id), None)
        if previous:
            if previous['_digest'] != digest:
                raise HTTPException(409, '同じrequest_idで入力が異なります')
            return public(previous)
    if not status()['available']:
        raise HTTPException(503, status()['message'])
    try:
        start, end = decode(spec.start, spec.mode == 'svg-frames'), decode(spec.end, spec.mode == 'svg-frames')
        if start.size != end.size:
            raise ValueError('開閉画像のサイズを揃えてください')
    except Exception as error:
        raise HTTPException(422, str(error)) from error
    with lock:
        # Recheck after decoding: another request may have completed meanwhile.
        previous = next((item for item in jobs.values() if item['request_id'] == spec.request_id), None)
        if previous:
            if previous['_digest'] != digest:
                raise HTTPException(409, '同じrequest_idで入力が異なります')
            return public(previous)
        if any(j.get('_working') or j['status'] in ('queued', 'running') for j in jobs.values()):
            raise HTTPException(409, '別のRIFE生成が実行中です。完了後に再実行してください')
        while len(jobs) >= 16:
            jobs.pop(next(iter(jobs)))
        jid = uuid.uuid4().hex
        jobs[jid] = dict(id=jid, request_id=spec.request_id, status='queued', progress=0, message='準備中', _digest=digest, _working=True)
        answer = public(jobs[jid])
    pool.submit(run, jid, spec, start, end)
    return answer


def public(job):
    return {k: v for k, v in job.items() if not k.startswith('_')}


@router.get('/jobs/{jid}')
def get_job(jid: str):
    with lock:
        if jid not in jobs:
            raise HTTPException(404, 'RIFE生成が見つかりません。再起動後は再生成してください')
        return public(jobs[jid])


@router.post('/jobs/{jid}/cancel')
def cancel(jid: str):
    with lock:
        if jid not in jobs:
            raise HTTPException(404, 'RIFE生成が見つかりません')
        if jobs[jid]['status'] in ('queued', 'running'):
            jobs[jid].update(status='cancelled', message='中止しました')
        return public(jobs[jid])
