import io
import tempfile
import time
import unittest
from collections import OrderedDict
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from PIL import Image
from studio import server, runtime, materials
from studio.agent_catalog import catalog
from studio.agent_client import AgentClient


class AgentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.patches = [patch.object(runtime, 'sessions', OrderedDict()),
                        patch.object(materials, 'STORE', self.root/'materials')]
        for p in self.patches: p.start()
        self.web = TestClient(server.app)
        self.agent = AgentClient('http://127.0.0.1:8765', [self.root], transport=self.web._transport)

    def tearDown(self):
        self.agent.close(); self.web.close()
        for p in reversed(self.patches): p.stop()
        self.temp.cleanup()

    def test_all_catalog_schemas_resolve_without_native_access(self):
        status = self.agent.get_json('/api/agent/capabilities')
        self.assertIn('outputs', status)
        for item in catalog():
            spec = self.agent.get_json('/api/agent/operations/'+item['name'])
            self.assertIn('operation', spec)
            self.assertFalse(spec['path'].startswith('/api/desktop'))
        with self.assertRaises(ValueError): self.agent.execute('desktop.health')
        with self.assertRaises(ValueError): self.agent.execute('output.close', {'sid':'a'*32}, read_only=True)

    def test_material_upload_edit_conflict_export_preview_download(self):
        source = self.root/'avatar.png'
        Image.new('RGBA', (32, 32), (210, 50, 80, 255)).save(source)
        state = self.agent.upload('materials.create', {'file':str(source)})['data']
        sid = {'mid':state['id']}
        edit = {k:state[k] for k in ('revision','name','layers')}
        edit['layers'][0]['opacity'] = .5
        result = self.agent.execute('materials.save', sid, body=edit)['data']
        self.assertEqual(result['revision'], 1)
        with self.assertRaisesRegex(ValueError, '409'): self.agent.execute('materials.save', sid, body=edit)
        preview = self.agent.preview(f"/api/materials/{state['id']}/files/{state['layers'][0]['asset']}")
        with Image.open(io.BytesIO(preview)) as image: self.assertEqual(image.size, (32, 32))
        exported = self.agent.execute('materials.export', sid)['data']
        dest = self.root/'corrected.psd'
        self.agent.download(exported['psd'], str(dest))
        self.assertEqual(dest.read_bytes()[:4], b'8BPS')
        with self.assertRaises(ValueError): self.agent.download(exported['psd'], str(dest))

    def test_local_files_paths_and_origins_are_bounded(self):
        for url in ('https://127.0.0.1', 'http://example.com', 'http://localhost@evil.test', 'http://localhost/foo'):
            with self.assertRaises(ValueError): AgentClient(url)
        for path in ('http://evil.test/x', '/api/desktop/health', '/assets/'+'a'*32+'/../x.png', '/assets/'+'a'*32+'/%2e.png'):
            with self.assertRaises(ValueError): self.agent.asset_path(path)
        with self.assertRaises(ValueError): self.agent.local_path(str(self.root.parent/'escape.txt'), writing=True)
        with self.assertRaises(ValueError): self.agent.execute('materials.get', {'mid':'../../desktop'})
        self.assertEqual(self.web.get('/api/agent/capabilities', headers={'Origin':'https://evil.test'}).status_code, 403)

    def test_expression_ack_idempotency_and_disconnect_are_distinct(self):
        sid = self.web.post('/api/runtime/sessions', json={'project':{'parts':[{'id':'x'}]},'tts':{'engine':'browser'}}).json()['session_id']
        url = f'/api/runtime/sessions/{sid}/expression'
        command = dict(request_id='smile', index=1, strength=.8)
        self.assertEqual(self.web.post(url, json=command).status_code, 409)
        with self.web.websocket_connect(f'/api/runtime/sessions/{sid}/socket/player', headers={'Origin':'http://testserver'}) as ws:
            ws.receive_json()
            result = self.web.post(url, json=command)
            self.assertEqual(result.status_code, 202)
            self.assertEqual(result.json()['status'], 'accepted')
            self.assertEqual(ws.receive_json()['request_id'], 'smile')
            self.assertEqual(self.web.post(url, json=command).json(), result.json())
            self.assertEqual(self.web.post(url, json={**command, 'index':2}).status_code, 409)
            ws.send_json(dict(type='expression_result',request_id='smile',expression={'index':1,'strength':.8}))
            for _ in range(100):
                result = self.web.get(url+'/smile').json()
                if result['status'] == 'completed': break
                time.sleep(.01)
            self.assertEqual(result['status'], 'completed')
            self.assertEqual(self.web.get(f'/api/runtime/sessions/{sid}').json()['expression']['index'], 1)
            self.web.post(url, json={**command,'request_id':'pending'})
            self.assertEqual(ws.receive_json()['request_id'], 'pending')
        self.assertEqual(self.web.get(url+'/pending').json()['status'], 'unknown')

    def test_expression_timeout_does_not_replay(self):
        sid = self.web.post('/api/runtime/sessions', json={'project':{'parts':[{'id':'x'}]},'tts':{'engine':'browser'}}).json()['session_id']
        s = runtime.sessions[sid]
        command = dict(request_id='timed', index=1, strength=1)
        s.expression_requests['timed'] = dict(status='accepted',created=time.time()-11,command=command)
        self.assertEqual(self.web.post(f'/api/runtime/sessions/{sid}/expression',json=command).json()['status'], 'unknown')


if __name__ == '__main__': unittest.main()
