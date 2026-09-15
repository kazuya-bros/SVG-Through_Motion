"""Identify the exact renderer sources required by a character package."""
import hashlib
import re
from pathlib import Path
from fastapi import APIRouter

router = APIRouter(prefix='/api/integration-runtime')
WEB = Path(__file__).resolve().parent.parent / 'web'

@router.get('')
def runtime_sources():
    pending = ['character-runtime.js']
    files = {}
    while pending:
        name = pending.pop()
        if name in files:
            continue
        path = (WEB / name).resolve()
        if not path.is_relative_to(WEB.resolve()) or path.suffix != '.js':
            raise ValueError('Runtime dependency outside web directory')
        data = path.read_bytes()
        files[name] = hashlib.sha256(data).hexdigest()
        for ref in re.findall(r'(?:from\s*|import\s*)[\'\"](\.[^\'\"]+)[\'\"]', data.decode('utf-8')):
            dependency = (path.parent / ref.split('?')[0]).resolve()
            pending.append(dependency.relative_to(WEB.resolve()).as_posix())
    entries = [dict(path='web/'+name, sha256=digest) for name, digest in sorted(files.items())]
    digest = hashlib.sha256('\n'.join(f'{v["path"]}:{v["sha256"]}' for v in entries).encode()).hexdigest()
    return dict(id='svg-through-canvas', apiVersion=1, behaviorVersion='1.0.0', build=digest, files=entries)
