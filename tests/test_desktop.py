import os
import time
import unittest
from collections import OrderedDict
from unittest.mock import patch

from fastapi.testclient import TestClient
from studio import server, runtime


class DesktopTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, SVG_THROUGH_DESKTOP_TOKEN='test-desktop-token')
        self.env.start()
        self.sessions = patch.object(runtime, 'sessions', OrderedDict())
        self.sessions.start()
        self.client = TestClient(server.app)
        self.auth = {'Authorization': 'Bearer test-desktop-token'}

    def tearDown(self):
        self.client.close()
        self.sessions.stop()
        self.env.stop()

    def launch(self, name='A', expressions=None):
        project = dict(name=name, parts=[{'id': 'part'}])
        if expressions is not None:
            project['expressionPresets'] = expressions
        return self.client.post('/api/runtime/sessions', json=dict(project=project, tts={'engine': 'browser'})).json()['session_id']

    def send(self, sid, **command):
        return self.client.post('/api/desktop/expression', headers=self.auth, json=dict(session_id=sid, **command))

    def test_bridge_requires_native_secret_and_rejects_foreign_origins(self):
        for path in ('health', 'sessions'):
            self.assertEqual(self.client.get('/api/desktop/'+path).status_code, 403)
            self.assertEqual(self.client.get('/api/desktop/'+path, headers=self.auth).status_code, 200)
            self.assertEqual(self.client.get('/api/desktop/'+path, headers={**self.auth, 'origin': 'https://example.com'}).status_code, 403)
        with patch.dict(os.environ, SVG_THROUGH_DESKTOP_TOKEN=''):
            self.assertEqual(self.client.get('/api/desktop/health', headers=self.auth).status_code, 403)

    def test_listing_only_exposes_names_and_expression_choices(self):
        self.launch('A')
        self.launch('B', [{'name': 'custom', 'pose': {'browL': 1}}])
        result = self.client.get('/api/desktop/sessions', headers=self.auth).json()
        self.assertEqual(result[0]['expressions'], ['通常', '笑顔', '驚き', '困り顔', 'ウインク'])
        self.assertEqual(result[1]['expressions'], ['custom'])
        self.assertNotIn('tts', result[0]); self.assertNotIn('pose', str(result))

    def test_expression_routes_to_exact_player_and_checks_range(self):
        sid = self.launch()
        other = self.launch('Other')
        self.assertEqual(self.send(sid, action='select', index=1).status_code, 409)
        with self.client.websocket_connect(f'/api/runtime/sessions/{sid}/socket/player', headers={'origin': 'http://testserver'}) as ws:
            ws.receive_json()
            for _ in range(100):
                if runtime.sessions[sid].status()['connected']: break
                time.sleep(.01)
            self.assertEqual(self.send(sid, action='select', index=5).status_code, 422)
            self.assertEqual(self.send(sid, action='hold', index=4).status_code, 422)
            self.assertEqual(self.send(other, action='select', index=1).status_code, 409)
            for action in ['select', 'hold', 'release', 'release_all']:
                self.assertEqual(self.send(sid, action=action, index=4, key='test-key').status_code, 200)
                message = ws.receive_json()
                self.assertEqual(message, dict(type='expression', action=action, index=4, key='test-key'))


if __name__ == '__main__':
    unittest.main()
