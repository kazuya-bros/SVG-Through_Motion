import io
import json
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch
from PIL import Image, ImageDraw
from fastapi.testclient import TestClient
from studio import assist, server


class AssistTests(unittest.TestCase):
    def setUp(self):
        self.root=Path(__file__).resolve().parents[1]/'qa'/('assist-store-'+uuid.uuid4().hex)
        self.patch=patch.object(assist,'ROOT',self.root);self.patch.start()
        self.client=TestClient(server.app)

    def tearDown(self):
        self.client.close();self.patch.stop()

    def test_append_only_checkpoints_and_concurrent_writer(self):
        sid=str(uuid.uuid4());body={'session':{'id':sid},'receipts':[],'summary':{'name':'test'}}
        path='/api/assist/sessions/'+sid
        self.assertEqual(self.client.post(path,json=body).json()['version'],1)
        self.assertEqual(self.client.post(path,json=body).status_code,409)
        body['summary']['name']='next'
        self.assertEqual(self.client.post(path+'?expected_version=1',json=body).json()['version'],2)
        self.assertEqual(self.client.get(path).json()['state']['summary']['name'],'next')
        self.assertEqual(len(list((self.root/'sessions'/sid).glob('*.json.gz'))),2)
        self.assertEqual(self.client.get('/api/assist/sessions').json()[0]['session_id'],sid)

    def test_session_list_scopes_history_to_requested_features(self):
        sid=str(uuid.uuid4())
        body={'session':{'id':sid,'base':{'parts':[{'id':'m','role':'mouth'},{'id':'e','role':'lash-l'}]}},
              'meta':{'targets':['m']},'receipts':[],'summary':{'project_id':'original'}}
        self.assertEqual(self.client.post('/api/assist/sessions/'+sid,json=body).status_code,200)
        summary=self.client.get('/api/assist/sessions').json()[0]['summary']
        self.assertEqual(summary['steps'],['mouth'])
        self.assertEqual(summary['project_id'],'original')
        self.assertNotIn('steps',self.client.get('/api/assist/sessions/'+sid).json()['state']['summary'])

    def test_png_import_requires_explicit_placement_and_transparency_mode(self):
        spec=dict(session_id=str(uuid.uuid4()),revision=0,part_id='p003',width=60,height=35,source_hash='a'*64,reference_url='/api/exports/'+'b'*32+'/reference.png')
        rid=self.client.post('/api/assist/asset-requests',json=spec).json()['request_id']
        image=Image.new('RGBA',(100,50),'white');ImageDraw.Draw(image).line((10,25,90,25),fill='#743642',width=3)
        buf=io.BytesIO();image.save(buf,format='PNG');payload=buf.getvalue()
        path=f'/api/assist/asset-requests/{rid}/import';data={'crop':'[0,0,100,50]'}
        upload=lambda d:self.client.post(path,data=d,files={'file':('x.png',payload,'image/png')})
        self.assertEqual(upload(data).status_code,422)
        data['placement_confirmed']='true';self.assertEqual(upload(data).status_code,422)
        data['extraction']='dark_ink';response=upload(data)
        self.assertEqual(response.status_code,200,response.text)
        asset=self.client.get('/api/assist/assets/'+response.json()['asset_id']).json()
        self.assertEqual(asset['source_hash'],spec['source_hash']);self.assertIn('<svg',asset['svg'])
        self.assertEqual(upload({**data,'crop':'[-1,0,100,50]'}).status_code,422)

    def test_deferred_input_start_is_idempotent_and_restart_reports_interrupted(self):
        targets=[server.DATA/'uploads'/'test'/'a.psd',server.DATA/'uploads'/'test'/'a.png']
        record=assist.register_input(targets,{'preset':'balanced','cleanup':False,'alpha':12,'motion_parts':False,'source_open':True},{},{'wish':'test'})
        iid=record['input_id']
        def started(*args,**kwargs):
            kwargs['before_start']('a'*32);return {'jobId':'a'*32}
        with patch.object(server,'start_job',side_effect=started) as start:
            a=self.client.post(f'/api/assist/inputs/{iid}/start');b=self.client.post(f'/api/assist/inputs/{iid}/start')
            self.assertEqual(a.status_code,200);self.assertEqual(b.status_code,200);start.assert_called_once()
            self.assertEqual(b.json()['state'],'interrupted')


if __name__=='__main__':unittest.main()
