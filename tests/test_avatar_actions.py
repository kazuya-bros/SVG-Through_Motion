import tempfile
import time
import unittest
from collections import OrderedDict
from pathlib import Path
from unittest.mock import patch
from fastapi.testclient import TestClient
from studio import server, runtime, avatar_actions


class AvatarActions(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.patches=[patch.object(avatar_actions,'STORE',Path(self.temp.name)),patch.object(runtime,'sessions',OrderedDict()),patch.dict('os.environ',{'SVG_THROUGH_DESKTOP_TOKEN':'avatar-test'})]
        for p in self.patches:p.start()
        self.client=TestClient(server.app);self.client.__enter__()
        self.sid=self.client.post('/api/runtime/sessions',json={'project':{'id':'character','parts':[{'id':'face','role':'static','svgText':'<svg/>'}]},'tts':{'engine':'browser'},'accepting':False}).json()['session_id']
        self.base='/api/avatar/sessions/'+self.sid
        self.socket=self.client.websocket_connect('/api/runtime/sessions/'+self.sid+'/socket/player',headers={'Origin':'http://testserver'})
        self.ws=self.socket.__enter__();self.ws.receive_json()

    def tearDown(self):
        self.socket.__exit__(None,None,None);self.client.__exit__(None,None,None)
        for p in reversed(self.patches):p.stop()
        self.temp.cleanup()

    def save(self,kind,identity='a'*32,**kwargs):
        r=self.client.post('/api/avatar/presets',json={'request_id':identity,'action':{'name':kind,'project_id':'character','kind':kind,**kwargs}})
        self.assertEqual(r.status_code,201,r.text);return r.json()['id']

    def trigger(self,identity='a'*32,rid='one'):
        return self.client.post(self.base+'/trigger',json={'request_id':rid,'preset_id':identity})

    def test_direction_ack_idempotency_and_native_bridge(self):
        identity=self.save('bounce',direction='left',duration=2)
        self.assertEqual(self.trigger().status_code,202)
        msg=self.ws.receive_json();self.assertEqual((msg['preset'],msg['direction'],msg['duration']),('bounce','left',2))
        self.assertEqual(self.trigger().status_code,202)
        self.ws.send_json({'type':'effect_result','request_id':'one','status':'completed'})
        for _ in range(30):
            r=self.client.get(self.base+'/trigger/one').json()
            if r['status']=='completed':break
            time.sleep(.01)
        self.assertEqual(r['status'],'completed')
        auth={'Authorization':'Bearer avatar-test'}
        listing=self.client.get('/api/desktop/sessions',headers=auth).json()
        self.assertIn(identity,[row['id'] for row in listing[0]['actions']])
        command={'session_id':self.sid,'action':'cue','cue_id':identity}
        self.assertEqual(self.client.post('/api/desktop/expression',json=command).status_code,403)
        self.assertEqual(self.client.post('/api/desktop/expression',json=command,headers=auth).status_code,200)
        self.assertEqual(self.ws.receive_json()['direction'],'left')

    def test_timed_emotions_do_not_erase_lighting_or_later_edits(self):
        self.save('sweat',behavior='timed',duration=.5,appearance={'sweat_x':-.2,'sweat_scale':.08})
        self.save('light','b'*32,appearance={'light':'night'})
        self.assertEqual(self.trigger().status_code,202);self.ws.receive_json()
        self.assertEqual(self.trigger('b'*32,'light').status_code,202);self.ws.receive_json()
        time.sleep(.6)
        look=self.client.get('/api/stage/sessions/'+self.sid).json()['baseline']['appearance']
        self.assertEqual(look['emotion'],'none');self.assertEqual(look['light'],'night')
        self.trigger(rid='again');self.ws.receive_json()
        state=self.client.get('/api/stage/sessions/'+self.sid).json();state['baseline']['appearance']['emotion']='blush'
        self.client.put('/api/stage/sessions/'+self.sid,json={k:state[k] for k in ['revision','mode','baseline']})
        time.sleep(.6)
        self.assertEqual(self.client.get('/api/stage/sessions/'+self.sid).json()['baseline']['appearance']['emotion'],'blush')

    def test_validation_toggle_and_reset(self):
        self.save('outline',appearance={'outline_color':'#ff8800'})
        for rid,wanted in [('on',True),('off',False)]:
            self.trigger(rid=rid);self.ws.receive_json()
            self.assertEqual(self.client.get('/api/stage/sessions/'+self.sid).json()['baseline']['appearance']['outline'],wanted)
        self.save('reset','b'*32);self.trigger('b'*32,'reset');self.ws.receive_json()
        self.assertEqual(self.ws.receive_json()['preset'],'none')
        self.assertEqual(self.client.post('/api/avatar/presets',json={'request_id':'c'*32,'action':{'name':'bad','kind':'image'}}).status_code,422)
        self.assertEqual(self.client.post('/api/avatar/presets',json={'request_id':'a'*32,'action':{'name':'different','kind':'happy'}}).status_code,409)
        self.assertEqual(self.client.post(self.base+'/trigger',json={'request_id':'on','preset_id':'b'*32}).status_code,409)

    def test_bundle_preview_defaults_and_revision(self):
        rows=self.client.get('/api/avatar/presets').json()
        self.assertEqual([r['action']['visibility'] for r in rows],[False,True])
        action={'name':'combined','kind':'bundle','project_id':'character','duration':.5,'behavior':'timed',
                'components':[{'kind':'expression','expression_index':1},{'kind':'blush'},{'kind':'outline'}],
                'appearance':{'blush_rotation':25}}
        saved=self.client.post('/api/avatar/presets',json={'request_id':'c'*32,'action':action}).json()
        self.assertEqual(saved['revision'],0)
        preview={'request_id':'preview','action':action}
        self.assertEqual(self.client.post(self.base+'/preview',json=preview).status_code,202)
        msg=self.ws.receive_json()
        self.assertEqual(msg['recipe']['behavior'],'timed');self.assertEqual(msg['duration'],.5)
        self.assertEqual(msg['recipe']['appearance']['blush_rotation'],25)
        self.assertTrue(msg['preview'])
        self.assertEqual(self.client.post(self.base+'/preview/stop',json={'request_id':'stop','expected_request_id':'preview'}).status_code,202)
        self.assertEqual(self.ws.receive_json()['restore_preview_id'],'preview')
        action['name']='updated'
        update={'request_id':'d'*32,'revision':0,'action':action}
        for _ in range(2):
            r=self.client.put('/api/avatar/presets/'+saved['id'],json=update)
            self.assertEqual(r.status_code,200,r.text);self.assertEqual(r.json()['revision'],1)
        update['request_id']='e'*32
        self.assertEqual(self.client.put('/api/avatar/presets/'+saved['id'],json=update).status_code,409)
        self.assertEqual(self.trigger('0'*32,'hidden').status_code,202)
        self.assertFalse(self.ws.receive_json()['recipe']['visibility'])
        self.assertEqual(self.trigger('0'*31+'1','normal').status_code,202)
        self.assertTrue(self.ws.receive_json()['recipe']['visibility'])
        action['components']=[{'kind':'blush'},{'kind':'blush'}]
        self.assertEqual(self.client.post(self.base+'/preview',json={'request_id':'invalid','action':action}).status_code,422)

    def test_persistent_preview_and_delete_revision(self):
        identity=self.save('bundle',components=[{'kind':'dissolve','duration':.5}],behavior='select',duration=.5)
        action=avatar_actions.load(identity).model_dump()
        self.assertEqual(self.client.post(self.base+'/preview',json={'request_id':'keep','action':action}).status_code,202)
        self.assertEqual(self.ws.receive_json()['recipe']['behavior'],'select')
        path='/api/avatar/presets/'+identity
        body={'request_id':'f'*32,'revision':1}
        self.assertEqual(self.client.request('DELETE',path,json=body).status_code,409)
        body['revision']=0
        for _ in range(2):self.assertEqual(self.client.request('DELETE',path,json=body).status_code,200)
        self.assertNotIn(identity,[r['id'] for r in self.client.get('/api/avatar/presets').json()])
        self.assertEqual(self.trigger(identity,'deleted').status_code,404)
        self.assertEqual(self.client.put(path,json={**body,'action':action}).status_code,404)
        self.assertEqual(self.client.request('DELETE','/api/avatar/presets/'+'0'*32,json=body).status_code,409)


if __name__=='__main__':unittest.main()
