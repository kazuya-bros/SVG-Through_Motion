"""Real stdio protocol + HTTP + material workflow, with isolated application data."""
import asyncio
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import unittest

import httpx
from PIL import Image

try:
    from mcp import ClientSession, StdioServerParameters, stdio_client
except ImportError:
    ClientSession = None


@unittest.skipIf(ClientSession is None, 'MCP SDK is required (desktop build venv)')
class MCPTests(unittest.IsolatedAsyncioTestCase):
    async def test_stdio_material_roundtrip(self):
        root = Path(__file__).resolve().parent.parent
        with tempfile.TemporaryDirectory() as folder:
            work = Path(folder)
            with socket.socket() as sock:
                sock.bind(('127.0.0.1', 0)); port = sock.getsockname()[1]
            origin = f'http://127.0.0.1:{port}'
            env = dict(os.environ, SVG_THROUGH_DATA_DIR=str(work/'data'))
            backend = subprocess.Popen([sys.executable,'-m','uvicorn','studio.server:app','--host','127.0.0.1','--port',str(port)],
                                       cwd=root,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            try:
                with httpx.Client(trust_env=False, timeout=1) as http:
                    for _ in range(100):
                        try:
                            if http.get(origin+'/api/health').status_code == 200: break
                        except httpx.HTTPError: pass
                        await asyncio.sleep(.1)
                    else: self.fail('isolated server startup failed')
                image = work/'face.png'; Image.new('RGBA',(32,32),(200,20,80,255)).save(image)
                packaged = os.environ.get('SVG_THROUGH_TEST_MCP_EXE')
                params = StdioServerParameters(command=packaged or sys.executable,
                    args=(['--mcp'] if packaged else [str(root/'tools/studio_mcp.py')])+['--url',origin,'--allow-dir',str(work)])
                async with stdio_client(params) as (read,write):
                    async with ClientSession(read,write) as session:
                        await session.initialize()
                        tools = await session.list_tools()
                        self.assertEqual(len(tools.tools),8)
                        async def call(name, arguments):
                            result = await session.call_tool(name,arguments)
                            self.assertFalse(result.is_error, str(result.content))
                            return result
                        await call('svg_status',{})
                        await call('svg_describe',{'operation':'output.effect'})
                        await call('svg_describe',{'operation':'stage.perform'})
                        uploaded = await call('svg_upload',{'operation':'stage.upload','files':{'file':str(image)},'fields':{'name':'演出テスト'}})
                        asset = uploaded.structured_content['data']
                        captured = await call('svg_preview',{'path':asset['url']})
                        self.assertEqual(captured.content[0].type,'image')
                        saved = await call('svg_write',{'operation':'stage.save_preset','body':{'request_id':'mcp-preset','recipe':{'name':'MCP演技','steps':[{'at':0,'scene':{'overlays':[{'asset_id':asset['id']}],'caption':{'color':'#abcdef','size':50}}}]}}})
                        await call('svg_read',{'operation':'stage.preset','path':{'pid':saved.structured_content['data']['id']}})
                        effects = await call('svg_read',{'operation':'output.effects'})
                        self.assertEqual({p['id'] for p in effects.structured_content['data']['presets']},
                                         {'none','dissolve','appear','comms','happy','ink','bounce','glitch','blocks'})
                        await call('svg_describe',{'operation':'materials.create'})
                        result = await call('svg_upload',{'operation':'materials.create','files':{'file':str(image)}})
                        state = result.structured_content['data']
                        await call('svg_read',{'operation':'materials.get','path':{'mid':state['id']}})
                        preview = await call('svg_preview',{'path':f"/api/materials/{state['id']}/files/{state['layers'][0]['asset']}"})
                        self.assertEqual(preview.content[0].type,'image')
                        result = await call('svg_write',{'operation':'materials.export','path':{'mid':state['id']}})
                        await call('svg_download',{'path':result.structured_content['data']['psd'],'destination':str(work/'result.psd')})
                        self.assertEqual((work/'result.psd').read_bytes()[:4],b'8BPS')
                        result = await call('svg_write',{'operation':'materials.convert','path':{'mid':state['id']}})
                        jid = result.structured_content['data']['jobId']
                        for _ in range(100):
                            result = await call('svg_read',{'operation':'projects.job','path':{'jid':jid}})
                            job = result.structured_content['data']
                            if job['state'] in ('done','error'): break
                            await asyncio.sleep(.1)
                        self.assertEqual(job['state'],'done',job)
                        result = await call('svg_read',{'operation':'projects.get','path':{'pid':job['projectId']}})
                        project = result.structured_content['data']
                        self.assertEqual(project['conversion']['traceProfile'],'supersampled-contours-v1')
                        self.assertIn('data-trace-scale="4"',project['parts'][0]['svgText'])
                        failure = await session.call_tool('svg_read',{'operation':'output.close','path':{'sid':'a'*32}})
                        self.assertTrue(failure.is_error)
                        self.assertIn('svg_write', failure.content[0].text)
            finally:
                backend.terminate()
                try: backend.wait(timeout=8)
                except subprocess.TimeoutExpired: backend.kill(); backend.wait()


if __name__ == '__main__': unittest.main()
