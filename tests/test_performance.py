import io
import tempfile
import time
import unittest
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch
from fastapi.testclient import TestClient
from PIL import Image
from studio import server, runtime, performance
from studio.agent_client import AgentClient


class PerformanceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.patches = [patch.object(performance, 'STORE', Path(self.tmp.name)/'stage'), patch.object(runtime, 'sessions', OrderedDict())]
        for p in self.patches: p.start()
        self.client = TestClient(server.app)
        self.client.__enter__()
        self.sid = self.client.post('/api/runtime/sessions', json={'project':{'parts':[{'id':'p'}]},'tts':{'engine':'browser'}}).json()['session_id']
        self.base = '/api/stage/sessions/'+self.sid
        self.socket = '/api/runtime/sessions/'+self.sid+'/socket/'
        self.origin = {'Origin':'http://testserver'}

    def tearDown(self):
        self.client.__exit__(None, None, None)
        for p in reversed(self.patches): p.stop()
        self.tmp.cleanup()

    def image(self):
        out=io.BytesIO();Image.new('RGBA',(64,64),(255,220,100,128)).save(out,format='PNG');return out.getvalue()

    def test_brow_tilt_roundtrip_and_validation(self):
        response = self.configure(baseline={'pose': {'browL': .2, 'browTiltL': .7, 'browTiltR': -.4}})
        self.assertEqual(response.status_code, 200)
        pose = self.client.get(self.base).json()['baseline']['pose']
        self.assertEqual((pose['browL'], pose['browTiltL'], pose['browTiltR']), (.2, .7, -.4))
        self.assertEqual(self.configure(baseline={'pose': {'browTiltL': 1.1}}).status_code, 422)
        self.assertEqual(self.client.get(self.base).json()['baseline']['pose'], pose)

    def test_appearance_validation_assets_and_preset_roundtrip(self):
        asset = self.upload().json()['id']
        appearance = dict(outline=True, light='background', light_asset_id=asset,
                          emotion='image', emotion_asset_id=asset, image_scale=.3)
        r = self.configure(baseline={'appearance': appearance})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['baseline']['appearance']['emotion_asset_id'], asset)
        before = self.client.get(self.base).json()
        for invalid in ({'outline_width': 99}, {'light': 'unknown'}, {'emotion': 'image'},
                        {'emotion_strength': -1}, {'colors': [{'part_id': 'missing', 'from_color': '#ff0000', 'to_color': '#00ff00'}]}):
            self.assertEqual(self.configure(baseline={'appearance': invalid}).status_code, 422)
        self.assertEqual(self.client.get(self.base).json(), before)
        self.assertEqual(self.configure(baseline={'appearance': {'light_asset_id': 'f'*32}}).status_code, 404)
        saved = self.client.post('/api/stage/presets', json={'request_id':'look1','recipe':{'name':'見た目: 夜','steps':[{'at':0,'scene':{'appearance':appearance}}]}})
        self.assertEqual(saved.status_code, 201)
        self.assertEqual(saved.json()['recipe']['steps'][0]['scene']['appearance']['light_asset_id'], asset)

    def test_part_color_requires_real_eligible_part(self):
        runtime.sessions[self.sid].project['parts'] = [{'id':'coat','role':'static','svgText':'<svg/>'},{'id':'eye','role':'iris-l','svgText':'<svg/>'}]
        color = {'part_id':'coat','from_color':'#ff8800','to_color':'#4488aa'}
        self.assertEqual(self.configure(baseline={'appearance':{'colors':[color]}}).status_code, 200)
        self.assertEqual(self.configure(baseline={'appearance':{'colors':[color,color]}}).status_code, 422)
        self.assertEqual(self.configure(baseline={'appearance':{'colors':[{**color,'part_id':'eye'}]}}).status_code, 422)

    def upload(self):
        return self.client.post('/api/stage/assets',files={'file':('moon.png',self.image(),'image/png')},data={'name':'月'})

    def configure(self, mode='ai', baseline=None):
        revision=self.client.get(self.base).json()['revision']
        return self.client.put(self.base,json={'revision':revision,'mode':mode,**({'baseline':baseline} if baseline else {})})

    def play(self,rid='act1',recipe=None):
        body={'request_id':rid,'revision':self.client.get(self.base).json()['revision'],'recipe':recipe or {'name':'試す'}}
        return self.client.post(self.base+'/perform',json=body),body

    def wait_result(self,rid,expected):
        for _ in range(100):
            value=self.client.get(self.base+'/perform/'+rid).json()
            if value['status']==expected:return value
            time.sleep(.01)
        self.fail(str(value))

    def test_images_are_normalized_deduplicated_and_recipes_persist(self):
        first=self.upload();self.assertEqual(first.status_code,201);asset=first.json();self.assertEqual(self.upload().json()['id'],asset['id'])
        self.assertEqual(self.client.get(asset['url']).headers['content-type'],'image/png')
        bad=self.client.post('/api/stage/assets',files={'file':('bad.svg',b'<svg/>')});self.assertEqual(bad.status_code,422)
        scene={'overlays':[{'asset_id':asset['id']}]};body={'request_id':'preset1','recipe':{'name':'月の夜','steps':[{'at':0,'scene':scene}]}}
        saved=self.client.post('/api/stage/presets',json=body);self.assertEqual(saved.status_code,201)
        self.assertEqual(self.client.post('/api/stage/presets',json=body).json(),saved.json())
        body['recipe']['name']='違う';self.assertEqual(self.client.post('/api/stage/presets',json=body).status_code,409)
        with TestClient(server.app) as reopened:self.assertEqual(reopened.get('/api/stage/library').json()['presets'][0]['recipe']['name'],'月の夜')
        agent=AgentClient('http://127.0.0.1:8765',transport=self.client._transport)
        self.assertTrue(agent.preview(asset['url']).startswith(b'\x89PNG'));agent.close()

    def test_schema_bounds_unknown_assets_mode_and_revision(self):
        self.assertEqual(self.play()[0].status_code,409)
        for recipe in ({'steps':[{'at':1}]},{'steps':[{'at':0},{'at':0}]},{'steps':[{'at':0,'scene':{'caption':{'size':999}}}]},{'duration':121}):
            self.assertEqual(self.client.post(self.base+'/perform',json={'request_id':'bad','revision':0,'recipe':recipe}).status_code,422)
        self.assertEqual(self.configure(baseline={'overlays':[{'asset_id':'a'*32}]}).status_code,404)
        self.configure();self.assertEqual(self.client.put(self.base,json={'revision':0,'mode':'fixed'}).status_code,409)
        self.assertEqual(self.client.get('/api/stage/library',headers={'Origin':'https://example.com'}).status_code,403)

    def test_real_player_receipts_restore_obs_and_no_replay(self):
        with self.client.websocket_connect(self.socket+'player',headers=self.origin) as ws:
            ws.receive_json();self.configure();ws.receive_json()
            response,body=self.play();self.assertEqual(response.status_code,202);ws.receive_json()
            self.assertEqual(self.client.post(self.base+'/perform',json=body).json(),response.json())
            ws.send_json({'type':'stage_result','request_id':'act1','status':'running'});message=ws.receive_json();self.assertIsNotNone(message['stage']['active']['started_at'])
            self.wait_result('act1','running')
            with self.client.websocket_connect(self.socket+'display',headers=self.origin) as obs:
                self.assertEqual(obs.receive_json()['stage']['active']['request_id'],'act1')
                obs.send_json({'type':'stage_result','request_id':'act1','status':'completed'})
                self.assertEqual(self.client.get(self.base+'/perform/act1').json()['status'],'running')
            ws.send_json({'type':'stage_result','request_id':'act1','status':'completed'});self.assertIsNone(ws.receive_json()['stage']['active']);self.wait_result('act1','completed')
            self.play('act2');ws.receive_json();self.configure('fixed');self.assertEqual(ws.receive_json()['stage']['mode'],'fixed');self.wait_result('act2','interrupted')
            self.configure();ws.receive_json();self.play('act3');ws.receive_json()
        self.wait_result('act3','unknown');self.assertEqual(self.client.get(self.base).json()['mode'],'fixed')

    def test_missing_ack_and_late_ack_cannot_revive_expired_performance(self):
        with self.client.websocket_connect(self.socket+'player',headers=self.origin) as ws:
            ws.receive_json();self.configure();ws.receive_json();self.play();ws.receive_json()
            runtime.sessions[self.sid].performances['act1']['created']-=21
            self.wait_result('act1','unknown')
            ws.send_json({'type':'stage_result','request_id':'act1','status':'running'})
            self.assertIsNone(self.client.get(self.base).json()['active'])

    def test_live_preview_roundtrip_and_unsolicited_upload_rejected(self):
        with self.client.websocket_connect(self.socket+'player',headers=self.origin) as ws:
            ws.receive_json()
            with ThreadPoolExecutor() as pool:
                future=pool.submit(self.client.get,self.base+'/preview')
                request=ws.receive_json();self.assertEqual(request['type'],'stage_capture')
                response=self.client.post(self.base+'/preview/'+request['id'],files={'file':('preview.png',self.image(),'image/png')});self.assertEqual(response.status_code,200)
                captured=future.result(timeout=5);self.assertEqual(captured.content,self.image())
            self.assertEqual(self.client.post(self.base+'/preview/'+request['id'],files={'file':('preview.png',self.image())}).status_code,404)


if __name__=='__main__':unittest.main()
