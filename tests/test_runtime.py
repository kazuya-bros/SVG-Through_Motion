import time
import unittest
from collections import OrderedDict
from unittest.mock import patch, AsyncMock

from fastapi.testclient import TestClient
from studio import server, runtime


class RuntimeTests(unittest.TestCase):
    def setUp(self):
        self.patcher = patch.object(runtime, 'sessions', OrderedDict())
        self.patcher.start()
        runtime.active_session_id = None
        runtime.fixed_requests.clear()
        self.client = TestClient(server.app)
        self.origin = {'origin': 'http://testserver'}
        body = dict(project={'name': 'test', 'parts': [{'id': 'p000'}]}, tts={'engine': 'browser'}, accepting=True)
        self.sid = self.client.post('/api/runtime/sessions', json=body).json()['session_id']
        self.base = '/api/runtime/sessions/' + self.sid

    def tearDown(self):
        self.client.close()
        self.patcher.stop()

    def state(self):
        return self.client.get(self.base).json()

    def wait(self, check):
        for _ in range(100):
            state = self.state()
            if check(state):
                return state
            time.sleep(.01)
        self.fail(str(state))

    def ready(self, ws):
        ws.receive_json()
        ws.send_json(dict(type='ready', ready=True))
        self.wait(lambda s: s['ready'])

    def post(self, **body):
        return self.client.post(self.base + '/speech', json=body)

    def test_requires_ready_and_validates_requests(self):
        self.assertEqual(self.post(request_id='one', text='こんにちは').status_code, 409)
        for body in [dict(request_id='one', action='replace', text='x'), dict(request_id='one', text=' '), dict(request_id='one', text='x'*2001)]:
            self.assertEqual(self.post(**body).status_code, 422)
        with self.client.websocket_connect(self.base + '/socket/player', headers=self.origin) as ws:
            ws.receive_json()
            self.assertEqual(self.state()['state'], 'starting')
            self.assertEqual(self.post(request_id='one', text='x').status_code, 409)

    def test_atomic_replace_caption_idempotency_and_stale_result(self):
        with self.client.websocket_connect(self.base + '/socket/player', headers=self.origin) as ws:
            self.ready(ws)
            body = dict(request_id='one', text='最初のセリフ')
            first = self.post(**body).json()
            self.assertEqual(ws.receive_json()['id'], first['id'])
            self.assertEqual(self.post(**body).json()['id'], first['id'])
            self.assertEqual(self.post(request_id='one', text='別の内容').status_code, 409)
            self.assertEqual(self.post(request_id='busy', text='x').status_code, 409)
            ws.send_json(dict(type='speaking', id=first['id']))
            self.assertEqual(self.wait(lambda s: s['state'] == 'speaking')['caption'], body['text'])
            self.assertEqual(self.post(request_id='wrong', action='replace', text='x', expected_utterance_id='old').status_code, 409)
            second = self.post(request_id='two', action='replace', text='次のセリフ', expected_utterance_id=first['id']).json()
            self.assertEqual(ws.receive_json(), dict(type='stop', id=first['id']))
            self.assertEqual(self.state()['state'], 'stopping')
            self.assertEqual(self.state()['caption'], '')
            self.assertEqual(self.post(request_id='three', text='x').status_code, 409)
            ws.send_json(dict(type='finished', id=first['id']))
            ws.send_json(dict(type='stopped', id=first['id']))
            self.assertEqual(ws.receive_json()['id'], second['id'])
            ws.send_json(dict(type='error', id=first['id'], error='stale'))
            ws.send_json(dict(type='speaking', id=second['id']))
            self.assertEqual(self.wait(lambda s: s['state'] == 'speaking')['caption'], '次のセリフ')
            ws.send_json(dict(type='finished', id=second['id']))
            self.wait(lambda s: s['state'] == 'idle')
            self.assertEqual(self.client.get(self.base+'/speech/one').json()['status'], 'interrupted')
            self.assertEqual(self.client.get(self.base+'/speech/two').json()['status'], 'completed')

    def test_disconnect_and_reconnect_do_not_replay(self):
        with self.client.websocket_connect(self.base + '/socket/player', headers=self.origin) as ws:
            self.ready(ws)
            self.post(request_id='one', text='x')
            ws.receive_json()
        self.wait(lambda s: s['state'] == 'closed')
        self.assertEqual(self.client.get(self.base+'/speech/one').json()['status'], 'interrupted')
        with self.client.websocket_connect(self.base + '/socket/player', headers=self.origin) as ws:
            self.ready(ws)
            self.assertIsNone(self.state()['current'])
            self.assertEqual(self.post(request_id='two', text='new').status_code, 202)
            self.assertEqual(ws.receive_json()['text'], 'new')

    def test_stop_and_audio_loss(self):
        with self.client.websocket_connect(self.base + '/socket/player', headers=self.origin) as ws:
            self.ready(ws)
            first=self.post(request_id='one', text='x').json();ws.receive_json()
            self.post(request_id='stop', action='stop', expected_utterance_id=first['id']);ws.receive_json()
            ws.send_json(dict(type='stopped', id=first['id']))
            self.wait(lambda s:s['state']=='idle')
            self.assertEqual(self.client.get(self.base+'/speech/stop').json()['status'], 'completed')
            self.post(request_id='two', text='x');ws.receive_json()
            ws.send_json(dict(type='ready', ready=False))
            self.wait(lambda s:not s['ready'])
            self.assertIsNone(self.state()['current'])

    def test_tts_secrets_are_private_and_engine_receives_session_config(self):
        body=dict(project={'parts':[{}]}, accepting=True, tts=dict(engine='voicevox', base_url='http://127.0.0.1:50021', speaker_id=7, api_key='private-test'))
        created=self.client.post('/api/runtime/sessions',json=body)
        self.assertEqual(created.status_code,201)
        base='/api/runtime/sessions/'+created.json()['session_id']
        self.assertNotIn('private-test', self.client.get(base+'/project').text)
        self.assertNotIn('private-test', self.client.get('/api/runtime/sessions').text)
        with self.client.websocket_connect(base+'/socket/player',headers=self.origin) as ws:
            ws.receive_json();ws.send_json(dict(type='ready',ready=True))
            for _ in range(100):
                if self.client.get(base).json()['ready']:break
                time.sleep(.01)
            first=self.client.post(base+'/speech',json=dict(request_id='one',text='テスト')).json();ws.receive_json()
            from fastapi.responses import Response
            with patch.object(server,'synthesize',AsyncMock(return_value=Response(b'fake',media_type='audio/wav'))) as synth:
                response=self.client.post(base+'/audio',json=dict(utterance_id=first['id'],text='テスト'))
                self.assertEqual(response.status_code,200)
                self.assertEqual(synth.call_args.args[0].speaker_id,7)
            self.assertEqual(self.client.post(base+'/audio',json=dict(utterance_id='old',text='x')).status_code,409)

    def test_display_is_read_only_and_output_independent_of_editor(self):
        with self.client.websocket_connect(self.base+'/socket/display',headers=self.origin) as display:
            display.receive_json()
            display.send_json(dict(type='ready',ready=True))
            self.assertFalse(self.state()['ready'])
            with self.client.websocket_connect(self.base+'/socket/player',headers=self.origin) as ws:
                self.ready(ws)
                self.assertFalse(self.client.get('/api/control/status').json()['connected'])
                self.assertEqual(self.post(request_id='one',text='x').status_code,202)
                ws.receive_json()

    def test_same_origin_and_session_cap(self):
        self.assertEqual(self.client.post('/api/runtime/sessions',json=dict(project={'parts':[{}]},tts={'engine':'browser'}),headers={'origin':'https://evil.test'}).status_code,403)
        for _ in range(8):
            self.client.post('/api/runtime/sessions',json=dict(project={'parts':[{}]},tts={'engine':'browser'}))
        self.assertEqual(len(runtime.sessions),4)

    def test_stop_timeout_closes_player_instead_of_accepting_overlap(self):
        with self.client.websocket_connect(self.base+'/socket/player',headers=self.origin) as ws:
            self.ready(ws)
            first=self.post(request_id='one',text='x').json();ws.receive_json()
            self.post(request_id='two',action='replace',expected_utterance_id=first['id'],text='next');ws.receive_json()
            runtime.sessions[self.sid].deadline=time.time()-1
            ws.send_json(dict(type='heartbeat'))
            self.wait(lambda s:s['state']=='closed')
            self.assertEqual(self.client.get(self.base+'/speech/two').json()['status'],'failed')

    def test_error_is_reported_and_close_cancels_pending(self):
        with self.client.websocket_connect(self.base+'/socket/player',headers=self.origin) as ws:
            self.ready(ws)
            first=self.post(request_id='one',text='x').json();ws.receive_json()
            ws.send_json(dict(type='error',id=first['id'],error='TTS unavailable'))
            self.assertEqual(self.wait(lambda s:s['state']=='error')['error'],'TTS unavailable')
            second=self.post(request_id='two',text='x').json();ws.receive_json()
            self.assertEqual(self.client.post(self.base+'/close').status_code,200)
            self.assertEqual(ws.receive_json()['type'],'close')
            self.assertEqual(self.client.get(self.base+'/speech/two').json()['status'],'interrupted')

    def test_player_is_exclusive_and_public_config_survives_editor_reload(self):
        from starlette.websockets import WebSocketDisconnect
        with self.client.websocket_connect(self.base+'/socket/player',headers=self.origin) as ws:
            self.ready(ws)
            with self.assertRaises(WebSocketDisconnect):
                with self.client.websocket_connect(self.base+'/socket/player',headers=self.origin):
                    pass
            self.assertEqual(self.state()['tts']['engine'],'browser')

    def test_fixed_api_reception_and_no_legacy_bypass(self):
        with self.client.websocket_connect(self.base+'/socket/player',headers=self.origin) as ws:
            self.ready(ws)
            self.client.post(self.base+'/reception',json={'accepting':False})
            state=self.client.get('/api/runtime/status').json()
            self.assertTrue(state['ready'])
            self.assertFalse(state['accepting'])
            self.assertNotIn('session_id',state)
            body=dict(request_id='fixed',text='hello')
            self.assertEqual(self.client.post('/api/runtime/speech',json=body).status_code,409)
            self.assertEqual(self.post(**body).status_code,409)
            self.client.post(self.base+'/reception',json={'accepting':True})
            first=self.client.post('/api/runtime/speech',json=body).json()
            self.assertEqual(ws.receive_json()['id'],first['id'])
            ws.send_json(dict(type='finished',id=first['id']))
            self.wait(lambda s:s['state']=='idle')
            self.assertEqual(self.client.get('/api/runtime/speech/fixed').json()['status'],'completed')

    def test_fixed_receipt_survives_switch_and_no_fallback_to_old_player(self):
        body=dict(request_id='stable',text='first')
        with self.client.websocket_connect(self.base+'/socket/player',headers=self.origin) as ws:
            self.ready(ws)
            first=self.client.post('/api/runtime/speech',json=body).json();ws.receive_json()
            other=self.client.post('/api/runtime/sessions',json=dict(project={'name':'second','parts':[{}]},tts={'engine':'browser'},accepting=True)).json()
            self.assertFalse(self.state()['accepting'])
            self.assertEqual(self.client.post('/api/runtime/speech',json=body).json()['id'],first['id'])
            self.assertEqual(self.client.post('/api/runtime/speech',json={**body,'text':'different'}).status_code,409)
            self.assertEqual(self.client.post('/api/runtime/speech',json=dict(request_id='new',text='next')).status_code,409)
            with self.client.websocket_connect('/api/runtime/sessions/'+other['session_id']+'/socket/player',headers=self.origin) as ws2:
                ws2.receive_json();ws2.send_json(dict(type='ready',ready=True))
                for _ in range(100):
                    if self.client.get('/api/runtime/status').json()['ready']:break
                    time.sleep(.01)
                self.assertEqual(self.client.post('/api/runtime/speech',json=dict(request_id='new',text='next')).status_code,202)
                self.assertEqual(ws2.receive_json()['text'],'next')
                self.assertEqual(self.client.post('/api/runtime/speech',json=dict(request_id='replace',action='replace',text='wrong target',expected_utterance_id=first['id'])).status_code,409)
            self.assertFalse(self.client.get('/api/runtime/status').json()['connected'])
            self.assertEqual(self.client.get('/api/runtime/status').json()['character'],'second')

    def test_reception_default_is_off(self):
        self.client.post('/api/runtime/sessions',json=dict(project={'parts':[{}]},tts={'engine':'browser'}))
        self.assertFalse(self.client.get('/api/runtime/status').json()['accepting'])

    def test_skill_client_submission_and_receipt_retry(self):
        import io
        import runpy
        import urllib.error
        from urllib.parse import urlsplit
        from contextlib import redirect_stdout, redirect_stderr
        helper=runpy.run_path('web/skills/svg-through-speak/scripts/speak.py')
        def call(url,payload=None):
            response=(self.client.get(urlsplit(url).path) if payload is None else self.client.post(urlsplit(url).path,json=payload))
            if response.status_code>=400:
                raise urllib.error.HTTPError(url,response.status_code,'test',{},io.BytesIO(response.content))
            return response.json()
        argv=['speak.py','speak','--text','helper test','--request-id','cli-test']
        with self.client.websocket_connect(self.base+'/socket/player',headers=self.origin) as ws:
            self.ready(ws)
            with patch.dict(helper['main'].__globals__,{'call':call}),patch('sys.argv',argv),redirect_stdout(io.StringIO()),redirect_stderr(io.StringIO()):
                self.assertEqual(helper['main'](),0)
                first=ws.receive_json()
                self.assertEqual(first['text'],'helper test')
                ws.send_json(dict(type='finished',id=first['id']))
                self.wait(lambda s:s['state']=='idle')
                self.assertEqual(helper['main'](),0)
                self.assertIsNone(self.state()['current'])


if __name__ == '__main__':
    unittest.main()
