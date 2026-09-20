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
from contextlib import ExitStack

import httpx
from PIL import Image
from psd_tools import PSDImage
from psd_tools.api.layers import PixelLayer

root=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser()
parser.add_argument('--server',type=Path,default=root/'.desktop-build/backend/svg-through-server/svg-through-server.exe')
parser.add_argument('--hybrid-dir',type=Path,help='Optional retained upload directory (face.psd, original.png and optional donor/depth PSDs)')
parser.add_argument('--expect-hybrid-error',help='For a negative fixture, assert this validation message instead of completion')
args=parser.parse_args()
exe=args.server.resolve()
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
            for _ in range(600):
                value=client.get('/api/jobs/'+job).json()
                if value['state'] in ('done','error'):break
                time.sleep(.1)
            assert value['state']=='done',value
            assert (folder/'data/projects'/value['projectId']/'project.json').is_file()
            project=json.loads((folder/'data/projects'/value['projectId']/'project.json').read_text(encoding='utf-8'))
            assert project['conversion']['preset']=='quality',project['conversion']
            assert project['conversion']['traceProfile']=='supersampled-contours-v1'
            assert 'data-trace-scale="4"' in (folder/'data/projects'/value['projectId']/project['parts'][0]['svg']).read_text(encoding='utf-8')
            print(json.dumps({'packaged_backend':'ok','conversion':'ok','data_dir':str(folder/'data')}))
            # PNG-only checks miss PSD compositing's lazy native imports. This
            # request exercises the same background worker used for real PSDs.
            psd=PSDImage.new('RGBA',(64,64))
            PixelLayer.frompil(image,psd,name='body')
            psd_buf=io.BytesIO();psd.save(psd_buf)
            response=client.post('/api/import',data={'open_features':'true'},files={'file':('layers.psd',psd_buf.getvalue(),'image/vnd.adobe.photoshop')})
            response.raise_for_status();job=response.json()['jobId']
            for _ in range(200):
                value=client.get('/api/jobs/'+job).json()
                if value['state'] in ('done','error'):break
                time.sleep(.1)
            assert value['state']=='done',value
            print('Packaged PSD worker conversion: OK',flush=True)
            if args.hybrid_dir:
                with ExitStack() as files:
                    uploads={}
                    for field,name in [('psd','face.psd'),('original','original.png'),('eyes_closed','donor-eyes_closed.psd'),('mouth_closed','donor-mouth_closed.psd'),('depth_psd','depth.psd')]:
                        source=args.hybrid_dir/name
                        if source.is_file():uploads[field]=(name,files.enter_context(source.open('rb')))
                    response=client.post('/api/import/hybrid',data={'open_features':'true','preset':'detail','cleanup':'true','alpha':'12','motion_parts':'true'},files=uploads,timeout=30)
                    response.raise_for_status();job=response.json()['jobId']
                previous=None
                for _ in range(600):
                    value=client.get('/api/jobs/'+job).json()
                    if value['message']!=previous:
                        print(json.dumps(value,ensure_ascii=False),flush=True);previous=value['message']
                    if value['state'] in ('done','error'):break
                    time.sleep(.5)
                if args.expect_hybrid_error:
                    assert value['state']=='error' and args.expect_hybrid_error in value['message'],value
                    print('Hybrid validation error reported without hanging: OK',flush=True)
                else:
                    assert value['state']=='done',value
                    print('Hybrid project: '+str(folder/'data/projects'/job/'project.json'),flush=True)
    finally:
        child.stdin.close()
        try:child.wait(timeout=10)
        except subprocess.TimeoutExpired:
            child.kill();child.wait();raise RuntimeError('Server remained alive after parent stdin closed')
    assert child.returncode==0,child.returncode
    print('Parent EOF shutdown: OK')
