import unittest
from unittest.mock import patch
import numpy as np
from PIL import Image, ImageDraw
from fastapi import FastAPI
from fastapi.testclient import TestClient
from studio import rife_morph as r
from studio.control import Command


class MorphTests(unittest.TestCase):
    def test_eye_timing_and_endpoints(self):
        profiles=[np.array([[.2]*5,[.2+.6*gap]*5]) for gap in [1,.6,.06,.01,0]]
        frames=r.fit_frames(profiles,'eye',.5)
        for frame in frames:
            ys=np.array(frame['ys']).reshape(2,5)
            self.assertTrue(np.all(ys[1]>ys[0]))
        np.testing.assert_allclose(np.array(frames[0]['ys']),[0]*5+[1]*5)
        np.testing.assert_allclose(np.array(frames[-1]['ys']),[.4875]*5+[.5125]*5)
        ys=np.array(frames[2]['ys']);self.assertAlmostEqual(np.mean(ys[5:]-ys[:5]),.5,places=5)
        rows=np.array([f['ys'] for f in frames])
        self.assertTrue(np.all(np.diff(rows[:,:5],axis=0)>=0))
        self.assertTrue(np.all(np.diff(rows[:,5:],axis=0)<=0))

    def test_mouth_endpoint_and_blank_input(self):
        profiles=[np.array([[.5-.3*t]*5,[.5+.3*t]*5]) for t in [.03,.1,.5,.8,1]]
        frames=r.fit_frames(profiles,'mouth',.5)
        np.testing.assert_allclose(frames[0]['ys'],[.4775]*5+[.5225]*5)
        np.testing.assert_allclose(frames[-1]['ys'],[0]*5+[1]*5)
        with self.assertRaises(ValueError):r.profile(Image.new('RGB',(64,64),r.BACKGROUND))
        with self.assertRaises(ValueError):r.decode(r.encode(Image.new('RGB',(500,500))))

    def test_jobs_deduplicate_conflict_cancel_and_bound_input(self):
        app=FastAPI();app.include_router(r.router);client=TestClient(app)
        image=Image.new('RGBA',(64,64));ImageDraw.Draw(image).ellipse((8,12,56,50),fill='red')
        body=dict(request_id='qa-test',kind='eye',anchor=.5,start=r.encode(image),end=r.encode(image))
        with r.lock:r.jobs.clear()
        with patch.object(r,'status',return_value={'available':True}),patch.object(r.pool,'submit'):
            a=client.post('/api/rife-morph/jobs',json=body);self.assertEqual(a.status_code,202);jid=a.json()['id']
            self.assertEqual(client.post('/api/rife-morph/jobs',json=body).json()['id'],jid)
            self.assertEqual(client.post('/api/rife-morph/jobs',json={**body,'anchor':.6}).status_code,409)
            self.assertEqual(client.post('/api/rife-morph/jobs',json={**body,'request_id':'another'}).status_code,409)
            self.assertEqual(client.post(f'/api/rife-morph/jobs/{jid}/cancel').json()['status'],'cancelled')
            self.assertNotIn('_digest',client.get(f'/api/rife-morph/jobs/{jid}').json())
            self.assertEqual(client.post('/api/rife-morph/jobs',json={**body,'request_id':'bad','start':'https://invalid'}).status_code,422)
        with r.lock:r.jobs.clear()

    def test_editor_contract(self):
        self.assertEqual(Command(action='rife',rife={'operation':'generate','target':'eyes'}).rife.target,'eyes')
        Command(action='settings',settings={'rifeEyes':True,'rifeMouth':False,'rifeStrength':.5})
        for body in [dict(action='rife'),dict(action='settings',settings={'rifeStrength':2}),dict(action='rife',rife={'operation':'face'})]:
            with self.assertRaises(ValueError):Command(**body)
