import tempfile,time,unittest
from collections import OrderedDict
from pathlib import Path
from unittest.mock import patch
from fastapi.testclient import TestClient
from studio import server,runtime,avatar_actions

class Characters(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.patches=[patch.object(runtime,'sessions',OrderedDict()),patch.object(avatar_actions,'STORE',Path(self.temp.name)),patch.dict('os.environ',{'SVG_THROUGH_DESKTOP_TOKEN':'characters-test'})]
  for p in self.patches:p.start()
  self.ids={};self.client=TestClient(server.app);self.client.__enter__();self.project={'id':'first','name':'A','width':100,'height':100,'parts':[{'id':'body','role':'static','svgText':'<svg/>'}]}
  self.sid=self.client.post('/api/runtime/sessions',json={'project':self.project,'tts':{'engine':'browser'}}).json()['session_id'];self.base='/api/runtime/sessions/'+self.sid
  self.ids['first']=self.client.get(self.base).json()['character_id'];self.socket=self.client.websocket_connect(self.base+'/socket/player',headers={'Origin':'http://testserver'});self.ws=self.socket.__enter__();self.ws.receive_json()
 def tearDown(self):
  self.socket.__exit__(None,None,None);self.client.__exit__(None,None,None)
  for p in reversed(self.patches):p.stop()
  self.temp.cleanup()
 def receive(self,kind):
  while True:
   m=self.ws.receive_json()
   if m['type']==kind:return m
 def add(self,identity):
  p={**self.project,'id':identity,'name':identity};r=self.client.post(self.base+'/characters',json={'project':p});self.ids[identity]=r.json().get('added_id');return r
 def switch(self,identity,rid):return self.client.post(self.base+'/characters/switch',json={'character_id':self.ids.get(identity,identity),'request_id':rid})
 def test_latest_switch_wins_and_native_roster(self):
  self.assertEqual(self.add('second').status_code,201);self.assertEqual(self.add('third').status_code,201)
  self.assertEqual(self.switch('second','one').status_code,202);self.receive('character')
  self.assertEqual(self.switch('third','two').status_code,202);self.receive('character')
  self.ws.send_json({'type':'character_result','request_id':'one','character_id':self.ids['second']})
  self.ws.send_json({'type':'character_result','request_id':'two','character_id':self.ids['third']})
  self.assertEqual(self.receive('effect')['recipe']['visibility'],True)
  self.assertEqual(self.client.get(self.base).json()['character_id'],self.ids['third'])
  self.assertEqual(self.client.get(self.base+'/characters/result/one').json()['status'],'interrupted')
  self.assertEqual(self.switch('third','two').json()['status'],'completed')
  self.assertEqual(self.switch('second','two').status_code,409)
  auth={'Authorization':'Bearer characters-test'};listing=self.client.get('/api/desktop/sessions',headers=auth).json();self.assertEqual(len(listing[0]['characters']),3)
  r=self.client.post('/api/desktop/expression',headers=auth,json={'session_id':self.sid,'action':'cue','cue_id':'0'*31+'1','character_id':self.ids['first']});self.assertEqual(r.status_code,200);m=self.receive('character');self.ws.send_json({'type':'character_result','request_id':m['request_id'],'character_id':self.ids['first']});self.receive('effect');self.assertEqual(self.client.get(self.base).json()['character_id'],self.ids['first'])
 def test_failed_preparation_keeps_previous_character(self):
  self.add('bad');self.switch('bad','fail');self.receive('character');self.ws.send_json({'type':'character_result','request_id':'fail','error':'SVG could not load'})
  for _ in range(50):
   r=self.client.get(self.base+'/characters/result/fail').json()
   if r['status']=='failed':break
   time.sleep(.01)
  self.assertEqual(r['status'],'failed');self.assertEqual(self.client.get(self.base).json()['character_id'],self.ids['first'])
  self.assertEqual(self.switch('unknown','missing').status_code,404)
 def test_roster_retry_conflicts_and_component_validation(self):
  self.assertEqual(self.add('second').status_code,201);self.assertEqual(self.add('second').status_code,201)
  self.assertEqual(self.client.post(self.base+'/characters',json={'project':{**self.project,'id':'second','name':'Changed'}}).status_code,201)
  from studio.avatar_recipe import Component,Bundle
  from pydantic import ValidationError
  self.assertEqual(Component(kind='glitch',speed=4).speed,4)
  for speed in [0,4.1,float('inf')]:
   with self.assertRaises(ValidationError):Component(kind='blocks',speed=speed)
  with self.assertRaises(ValidationError):Bundle(components=[Component(kind='blocks'),Component(kind='appear')])
