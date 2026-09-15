"""Smoke-test the packaged Python runtime and shutdown-on-parent-EOF contract."""
import io
import argparse
import json
import os
from pathlib import Path
import socket
import subprocess
import time
import uuid

import httpx
from PIL import Image

root=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser()
parser.add_argument('--server',type=Path,default=root/'.desktop-build/backend/svg-through-server/svg-through-server.exe')
exe=parser.parse_args().server.resolve()
folder=root/'.desktop-build/qa'/uuid.uuid4().hex
folder.mkdir(parents=True)
with socket.socket() as sock:
    sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
token=uuid.uuid4().hex
env={**os.environ,'SVG_THROUGH_DATA_DIR':str(folder/'data'),'SVG_THROUGH_DESKTOP_TOKEN':token,'PYTHONUTF8':'1'}
with (folder/'server.log').open('wb') as log:
    child=subprocess.Popen([str(exe),'--port',str(port)],env=env,stdin=subprocess.PIPE,stdout=log,stderr=log,
                           creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    try:
        with httpx.Client(base_url=f'http://127.0.0.1:{port}',trust_env=False,timeout=3) as client:
            for _ in range(150):
                if child.poll() is not None:raise RuntimeError((folder/'server.log').read_text(errors='replace'))
                try:
                    health=client.get('/api/desktop/health',headers={'Authorization':'Bearer '+token})
                    if health.status_code==200:break
                except httpx.HTTPError:pass
                time.sleep(.2)
            else:raise RuntimeError('Packaged backend did not become healthy')
            assert Path(health.json()['data_dir'])==(folder/'data')
            assert client.get('/').status_code==200
            assert client.get('/web/expression-selection.js').status_code==200
            assert client.get('/api/desktop/health').status_code==403
            # Real PSD/Pillow/VTracer imports and image conversion are exercised by
            # the normal upload endpoint, with a tiny disposable input.
            image=Image.new('RGBA',(64,64),(90,120,220,255));buf=io.BytesIO();image.save(buf,format='PNG')
            response=client.post('/api/import',data={'open_features':'true'},files={'file':('test.png',buf.getvalue(),'image/png')})
            response.raise_for_status();job=response.json()['jobId']
            for _ in range(100):
                value=client.get('/api/jobs/'+job).json()
                if value['state'] in ('done','error'):break
                time.sleep(.1)
            assert value['state']=='done',value
            assert (folder/'data/projects'/value['projectId']/'project.json').is_file()
            print(json.dumps({'packaged_backend':'ok','conversion':'ok','data_dir':str(folder/'data')}))
    finally:
        child.stdin.close()
        try:child.wait(timeout=10)
        except subprocess.TimeoutExpired:
            child.kill();child.wait();raise RuntimeError('Server remained alive after parent stdin closed')
    assert child.returncode==0,child.returncode
    print('Parent EOF shutdown: OK')
