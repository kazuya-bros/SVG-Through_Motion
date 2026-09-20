import time
import unittest
from collections import OrderedDict
from unittest.mock import patch
from fastapi.testclient import TestClient
from studio import server, runtime


class EffectTests(unittest.TestCase):
    def setUp(self):
        self.patch = patch.object(runtime, 'sessions', OrderedDict()); self.patch.start()
        self.client = TestClient(server.app)
        self.sid = self.client.post('/api/runtime/sessions', json={'project':{'parts':[{'id':'part'}]},'tts':{'engine':'browser'}}).json()['session_id']
        self.base = f'/api/runtime/sessions/{self.sid}'
        self.origin = {'Origin':'http://testserver'}

    def tearDown(self):
        self.client.close(); self.patch.stop()

    def post(self, rid='cue1', **kwargs):
        return self.client.post(self.base+'/effect', json=dict(request_id=rid,preset='happy',duration=4,strength=.7,**kwargs))

    def await_status(self, rid, expected):
        for _ in range(100):
            item = self.client.get(self.base+'/effect/'+rid).json()
            if item.get('status') == expected: return item
            time.sleep(.01)
        self.fail(str(item))

    def test_validation_connection_and_speech_binding(self):
        self.assertEqual({p['id'] for p in self.client.get('/api/runtime/effects').json()['presets']}, {'none','dissolve','appear','comms','happy','ink','bounce','glitch','blocks'})
        self.assertEqual(self.post().status_code,409)
        for body in ({'preset':'invalid'},{'duration':31},{'strength':-1}):
            self.assertEqual(self.client.post(self.base+'/effect',json={'request_id':'x','preset':'happy',**body}).status_code,422)
        with self.client.websocket_connect(self.base+'/socket/player',headers=self.origin) as ws:
            ws.receive_json()
            self.assertEqual(self.post(until_speech_end=True).status_code,409)
        self.assertEqual(self.client.get('/api/runtime/effects',headers={'Origin':'https://example.com'}).status_code,403)

    def test_acknowledgement_retries_obs_and_disconnect(self):
        with self.client.websocket_connect(self.base+'/socket/player',headers=self.origin) as player:
            player.receive_json()
            response=self.post(); self.assertEqual(response.status_code,202); self.assertEqual(response.json()['status'],'accepted')
            message=player.receive_json(); self.assertEqual(message['type'],'effect')
            self.assertEqual(self.post().json(),response.json())
            self.assertEqual(self.client.post(self.base+'/effect',json={'request_id':'cue1','preset':'comms'}).status_code,409)
            player.send_json({'type':'effect_result','request_id':'cue1','status':'running'})
            self.await_status('cue1','running')
            cue={k:v for k,v in message.items() if k!='type'};cue.update(started_at=1,reduced=False)
            with self.client.websocket_connect(self.base+'/socket/display',headers=self.origin) as display:
                display.receive_json()
                player.send_json({'type':'pose','pose':{'mouth':.4},'time':2,'effect':cue})
                streamed=display.receive_json();self.assertEqual(streamed['effect'],cue);self.assertEqual(streamed['time'],2)
                self.assertEqual(self.client.get(self.base).json()['effect']['preset'],'happy')
                # Display viewers cannot spoof completion or replace a cue.
                display.send_json({'type':'effect_result','request_id':'cue1','status':'completed'})
                self.assertEqual(self.client.get(self.base+'/effect/cue1').json()['status'],'running')
            player.send_json({'type':'effect_result','request_id':'cue1','status':'completed'})
            self.await_status('cue1','completed')
            self.post('pending');self.assertEqual(player.receive_json()['request_id'],'pending')
        self.assertEqual(self.client.get(self.base+'/effect/pending').json()['status'],'unknown')
        self.assertIsNone(self.client.get(self.base).json()['effect'])

    def test_timeout_is_unknown_and_does_not_resend(self):
        with self.client.websocket_connect(self.base+'/socket/player',headers=self.origin) as ws:
            ws.receive_json();self.post();ws.receive_json()
            runtime.sessions[self.sid].effect_requests['cue1']['created']-=11
            self.assertEqual(self.post().json()['status'],'unknown')


if __name__=='__main__':unittest.main()
