"""Bounded-memory PNG-to-MP4 export; no whole-loop ZIP or frame directory."""
from __future__ import annotations
import io
import re
import shutil
import subprocess
import threading
import time
import uuid
from typing import Literal
from pathlib import Path

import imageio_ffmpeg
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from PIL import Image
from starlette.concurrency import run_in_threadpool

router = APIRouter(prefix='/api/loop-exports')
from .paths import DATA
EXPORTS = DATA / 'exports'
MAX_FRAME_BYTES = 8 * 1024**2
jobs = {}
registry_lock = threading.Lock()

class LoopSpec(BaseModel):
    frames: int = Field(ge=1, le=900)
    width: int = Field(ge=1, le=1080)
    height: int = Field(ge=1, le=1080)
    format: Literal['mp4', 'webm-alpha'] = 'mp4'
    fps: int = Field(default=30, ge=1, le=60)

def lookup(eid):
    if not re.fullmatch(r'[a-f0-9]{32}', eid) or eid not in jobs:
        raise HTTPException(404, '動画の書き出しが見つかりません。もう一度書き出してください。')
    return jobs[eid]

def stop(job):
    process = job['process']
    if process.poll() is None:
        process.kill()
    process.wait(timeout=10)
    try:
        if process.stdin:
            process.stdin.close()
    except (OSError, ValueError):
        pass
    finally:
        job['log'].close()

def disk_guard():
    if shutil.disk_usage(EXPORTS).free < 2 * 1024**3:
        raise HTTPException(507, '保存先の空き容量が2GB未満です。空き容量を確保してください。')

@router.post('')
def begin(spec: LoopSpec):
    EXPORTS.mkdir(parents=True, exist_ok=True)
    disk_guard()
    with registry_lock:
        # Release abandoned encoders on the next export, never another active job.
        for key, job in list(jobs.items()):
            if time.monotonic() - job['updated'] > 900 and job['lock'].acquire(blocking=False):
                try:
                    stop(job)
                    del jobs[key]
                finally:
                    job['lock'].release()
        if len(jobs) >= 2:
            raise HTTPException(409, '別の動画を書き出し中です。完了してからお試しください。')
        eid = uuid.uuid4().hex
        directory = EXPORTS / eid
        directory.mkdir()
        log = (directory / 'encoder.log').open('wb')
        alpha = spec.format == 'webm-alpha'
        output = directory / ('svg-through-motion.partial.webm' if alpha else 'svg-through-motion.partial.mp4')
        codec = (['-c:v', 'libvpx-vp9', '-lossless', '1', '-pix_fmt', 'yuva420p',
                  '-auto-alt-ref', '0', '-lag-in-frames', '0', '-deadline', 'good', '-cpu-used', '4'] if alpha else
                 ['-vf', 'scale=1080:1350:force_original_aspect_ratio=decrease:flags=lanczos,pad=1080:1350:(ow-iw)/2:(oh-ih)/2:color=white',
                  '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'])
        try:
            process = subprocess.Popen([
                imageio_ffmpeg.get_ffmpeg_exe(), '-nostdin', '-hide_banner', '-loglevel', 'error',
                '-f', 'image2pipe', '-framerate', str(spec.fps), '-vcodec', 'png', '-i', 'pipe:0',
                *codec, str(output)
            ], stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=log,
               creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        except (OSError, RuntimeError) as exc:
            log.close()
            raise HTTPException(502, '動画エンコーダーを開始できませんでした。') from exc
        jobs[eid] = dict(process=process, log=log, output=output, spec=spec,
                         next=0, updated=time.monotonic(), lock=threading.Lock())
    return dict(id=eid, frames=spec.frames)

def append_frame(eid, index, data):
    job = lookup(eid)
    with job['lock']:
        spec = job['spec']
        if index != job['next'] or index >= spec.frames:
            raise HTTPException(409, '動画フレームの順番が一致しません。')
        try:
            with Image.open(io.BytesIO(data)) as im:
                if im.format != 'PNG' or im.size != (spec.width, spec.height):
                    raise ValueError('画像サイズまたは形式が不正です')
                im.verify()
        except (ValueError, OSError) as exc:
            raise HTTPException(422, '動画フレームを読み込めません。') from exc
        disk_guard()
        try:
            job['process'].stdin.write(data)
            job['process'].stdin.flush()
        except (OSError, ValueError) as exc:
            raise HTTPException(502, '動画への変換が中断されました。もう一度お試しください。') from exc
        job['next'] += 1
        job['updated'] = time.monotonic()
        return dict(frames=job['next'], total=spec.frames)

@router.put('/{eid}/frames/{index}')
async def upload_frame(eid: str, index: int, request: Request):
    lookup(eid)
    data = bytearray()
    async for chunk in request.stream():
        if len(data) + len(chunk) > MAX_FRAME_BYTES:
            raise HTTPException(413, '1コマの画像が8MBを超えています。')
        data.extend(chunk)
    return await run_in_threadpool(append_frame, eid, index, data)

@router.post('/{eid}/finish')
def finish(eid: str):
    job = lookup(eid)
    with job['lock']:
        if job['next'] != job['spec'].frames:
            raise HTTPException(409, 'まだすべての動画フレームを受信していません。')
        try:
            job['process'].stdin.close()
            code = job['process'].wait(timeout=180)
            output = job['output']
            if code or not output.is_file() or not output.stat().st_size:
                raise HTTPException(502, '動画変換を完了できませんでした。')
            if job['spec'].format == 'webm-alpha':
                # Older libvpx/FFmpeg builds can silently lose delayed alpha
                # frames. Never pair a shortened video with the full mouth track.
                count, _ = imageio_ffmpeg.count_frames_and_secs(str(output))
                if count != job['spec'].frames:
                    raise HTTPException(502, '動画のコマ数が追跡データと一致しません。書き出しをやり直してください。')
            final = output.with_name('svg-through-motion'+output.suffix)
            output.rename(final)
            return dict(url=f'/api/exports/{eid}/{final.name}', path=str(final),
                        bytes=final.stat().st_size, frames=job['next'])
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise HTTPException(502, '動画の保存を完了できませんでした。') from exc
        finally:
            stop(job)
            jobs.pop(eid, None)

@router.delete('/{eid}')
def abort(eid: str):
    job = jobs.get(eid)
    if job:
        with job['lock']:
            stop(job)
            jobs.pop(eid, None)
    return dict(stopped=True)

@router.on_event('shutdown')
def shutdown_encoders():
    for eid in list(jobs):
        abort(eid)
