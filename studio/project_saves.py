"""User-selected project destinations; the HTTP client never supplies a write path."""
import ctypes
import hashlib
import json
import os
import shutil
import threading
import time
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from starlette.concurrency import run_in_threadpool
from .paths import DATA

router = APIRouter(prefix='/api/project-saves', tags=['project-save'])
EXPORTS = DATA / 'exports'
tickets = {}
lock = threading.Lock()
picker_lock = threading.Lock()


class Choose(BaseModel):
    model_config = ConfigDict(extra='forbid')
    request_id: str = Field(pattern=r'^[a-zA-Z0-9_-]{8,80}$')
    name: str = Field(min_length=1, max_length=150)


def pick_save_path(name):
    if os.name != 'nt':
        raise HTTPException(501, 'この環境では保存先ダイアログを開けません。')
    from ctypes import wintypes as w
    class OPENFILENAME(ctypes.Structure):
        _fields_ = [('lStructSize', w.DWORD), ('hwndOwner', w.HWND), ('hInstance', w.HINSTANCE),
                    ('lpstrFilter', w.LPCWSTR), ('lpstrCustomFilter', w.LPWSTR), ('nMaxCustFilter', w.DWORD),
                    ('nFilterIndex', w.DWORD), ('lpstrFile', w.LPWSTR), ('nMaxFile', w.DWORD),
                    ('lpstrFileTitle', w.LPWSTR), ('nMaxFileTitle', w.DWORD), ('lpstrInitialDir', w.LPCWSTR),
                    ('lpstrTitle', w.LPCWSTR), ('Flags', w.DWORD), ('nFileOffset', w.WORD), ('nFileExtension', w.WORD),
                    ('lpstrDefExt', w.LPCWSTR), ('lCustData', ctypes.c_ssize_t), ('lpfnHook', ctypes.c_void_p),
                    ('lpTemplateName', w.LPCWSTR), ('pvReserved', ctypes.c_void_p), ('dwReserved', w.DWORD), ('FlagsEx', w.DWORD)]
    import re
    filename = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '_', name).strip('. ')[:100] or 'character'
    if re.fullmatch(r'(?i)(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])', filename):
        filename = '_' + filename
    buffer = ctypes.create_unicode_buffer(filename + '.project.json', 32768)
    form = OPENFILENAME();form.lStructSize = ctypes.sizeof(form)
    ctypes.windll.user32.GetForegroundWindow.restype = w.HWND
    form.hwndOwner = ctypes.windll.user32.GetForegroundWindow()
    form.lpstrFilter = 'SVG-Through プロジェクト (*.json)\0*.json\0\0'
    form.lpstrFile = ctypes.cast(buffer, w.LPWSTR);form.nMaxFile = len(buffer)
    form.lpstrTitle = 'プロジェクトの保存先';form.lpstrDefExt = 'json'
    form.Flags = 0x00080000 | 0x00000800 | 0x00000002 | 0x00000008  # Explorer, existing directory, overwrite prompt, no cwd change
    if ctypes.windll.comdlg32.GetSaveFileNameW(ctypes.byref(form)):
        return Path(buffer.value).resolve()
    if ctypes.windll.comdlg32.CommDlgExtendedError():
        raise HTTPException(502, '保存先ダイアログを開けませんでした。')
    return None


def fingerprint(path):
    try:
        s = path.stat();return (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns)
    except FileNotFoundError:
        return None


@router.post('/choose')
def choose(body: Choose):
    if not body.name.strip():
        raise HTTPException(422, 'プロジェクト名を入力してください。')
    with lock:
        for key, item in list(tickets.items()):
            if time.monotonic() - item['created'] > 1800 and not item.get('busy'):
                del tickets[key]
        existing = tickets.get(body.request_id)
        if existing:
            if existing['name'] != body.name:
                raise HTTPException(409, '同じリクエストIDで名前を変更できません。')
            if 'choice' not in existing:
                raise HTTPException(409, '保存先を選択中です。')
            return existing['choice']
        if not picker_lock.acquire(blocking=False):
            raise HTTPException(409, '別の保存先を選択中です。')
        tickets[body.request_id] = {'created': time.monotonic(), 'name': body.name, 'busy': True}
    try:
        path = pick_save_path(body.name)
        if path and (path.suffix.lower() != '.json' or not path.parent.is_dir() or path.is_dir()):
            raise HTTPException(422, '保存先にはJSONファイルを指定してください。')
        choice = {'ticket': body.request_id if path else None, 'path': str(path) if path else None}
        with lock:
            tickets[body.request_id].update(choice=choice, path=path, fingerprint=fingerprint(path) if path else None, busy=False)
        return choice
    except Exception:
        with lock:
            tickets.pop(body.request_id, None)
        raise
    finally:
        picker_lock.release()


def commit(ticket, content):
    digest = hashlib.sha256(content).hexdigest()
    try:
        project = json.loads(content)
    except (ValueError, UnicodeError):
        raise HTTPException(422, 'プロジェクトJSONが不正です。')
    if not isinstance(project, dict) or not isinstance(project.get('name'), str) or not 1 <= len(project['name'].strip()) <= 150 or not isinstance(project.get('parts'), list):
        raise HTTPException(422, 'プロジェクト名とパーツが必要です。')
    with lock:
        item = tickets.get(ticket)
        if not item or not item.get('path') or time.monotonic()-item['created'] > 1800:
            raise HTTPException(409, '保存先を選び直してください。')
        if item.get('result'):
            if item['digest'] != digest:
                raise HTTPException(409, '保存済みの内容と異なります。保存先を選び直してください。')
            return item['result']
        if item.get('busy'):
            raise HTTPException(409, '保存中です。')
        item['busy'] = True
    path = item['path'];temporary = path.with_name('.svg-through-' + uuid.uuid4().hex + '.tmp')
    try:
        if fingerprint(path) != item['fingerprint']:
            raise HTTPException(409, '選択後に保存先のファイルが変更されました。保存先を選び直してください。')
        EXPORTS.mkdir(parents=True, exist_ok=True)
        if any(shutil.disk_usage(p).free < len(content)*2 + 4*1024**2 for p in (path.parent, EXPORTS)):
            raise HTTPException(507, '保存先の空き容量が不足しています。')
        directory = EXPORTS / uuid.uuid4().hex;directory.mkdir(parents=True)
        archive = directory / 'svg-through-motion.project.json';archive.write_bytes(content)
        with temporary.open('xb') as stream:
            stream.write(content);stream.flush();os.fsync(stream.fileno())
        if fingerprint(path) != item['fingerprint']:
            raise HTTPException(409, '保存先のファイルが変更されました。保存先を選び直してください。')
        os.replace(temporary, path)
        result = {'url': f'/api/exports/{directory.name}/{archive.name}', 'path': str(path), 'bytes': len(content), 'name': project['name']}
        with lock:
            item.update(result=result, digest=digest)
        return result
    except OSError as exc:
        raise HTTPException(502, '保存できませんでした。保存先の空き容量と書き込み権限を確認してください。') from exc
    finally:
        try:
            temporary.unlink(missing_ok=True)
        except OSError:
            pass
        with lock:
            item['busy'] = False


@router.get('/{ticket}')
def status(ticket: str):
    with lock:
        item = tickets.get(ticket)
        if not item:
            raise HTTPException(404, '保存操作が見つかりません。')
        return {'state': 'saved' if item.get('result') else 'busy' if item.get('busy') else 'selected' if item.get('path') else 'cancelled', 'result': item.get('result')}


@router.post('/{ticket}')
async def save(ticket: str, request: Request):
    chunks = [];size = 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > 100*1024**2:
            raise HTTPException(413, 'プロジェクトは100MB以下にしてください。')
        chunks.append(chunk)
    return await run_in_threadpool(commit, ticket, b''.join(chunks))
