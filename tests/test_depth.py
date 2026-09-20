import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import numpy as np
from PIL import Image
from psd_tools import PSDImage
from psd_tools.api.layers import PixelLayer, Group
from fastapi.testclient import TestClient
from studio.depth import read_depth, attach_depth
from studio import server, assist


class DepthTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parents[1]/'qa')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.base = PSDImage.new('RGBA', (128, 128))
        PixelLayer.frompil(Image.new('RGBA', (64, 64), 'orange'), self.base, name='face', left=32, top=16)
        PixelLayer.frompil(Image.new('RGBA', (100, 50), 'silver'), self.base, name='front hair', left=14, top=2)

    def depth(self, size=(128, 128), left=32, face=True):
        psd = PSDImage.new('L', size)
        if face:
            a = np.tile(np.linspace(90, 110, 64).astype('uint8'), (64, 1))
            PixelLayer.frompil(Image.fromarray(a), psd, name='face', left=left, top=16)
        PixelLayer.frompil(Image.new('L', (100, 50), 40), psd, name='front hair', left=14, top=2)
        path = self.root/'depth.psd'; psd.save(path); return path

    def test_optional_aligned_field_is_small_finite_and_self_contained(self):
        self.assertIsNone(read_depth(None, self.base))
        path = self.depth(); raw = path.read_bytes(); data = read_depth(path, self.base)
        self.assertEqual(data['field']['size'], 65)
        self.assertEqual(len(data['field']['values']), 4225)
        self.assertTrue(all(0 <= v <= 1 for v in data['field']['values']))
        self.assertLess(data['field']['parts']['front'], data['field']['median'])
        project = dict(rig={}, settings={}, conversion={})
        attach_depth(project, data); restored = json.loads(json.dumps(project))
        self.assertEqual(restored['rig']['depth'], data['field'])
        self.assertTrue(restored['settings']['depthEnabled'])
        self.assertEqual(restored['conversion']['depth']['donorPolicy'], 'inherit-base-face')
        self.assertEqual(path.read_bytes(), raw)

    def test_mismatched_canvas_position_and_missing_face_are_explained(self):
        for kwargs, text in [({'size':(256,256)},'キャンバス'),({'left':33},'レイヤー位置'),({'face':False},'Face')]:
            with self.subTest(kwargs=kwargs), self.assertRaisesRegex(ValueError, text):
                read_depth(self.depth(**kwargs), self.base)
        path=self.root/'color.psd';self.base.save(path)
        with self.assertRaisesRegex(ValueError,'グレースケール'):read_depth(path,self.base)

    def test_hidden_face_explains_visibility_and_does_not_modify_psd(self):
        path = self.depth()
        self.base[0].visible = False
        with self.assertRaisesRegex(ValueError, '通常PSD.*face.*非表示.*ON.*保存し直して'):
            read_depth(path, self.base)
        self.assertFalse(self.base[0].visible)
        self.base[0].visible = True
        depth = PSDImage.open(path); depth[0].visible = False; depth.save(path)
        raw = path.read_bytes()
        with self.assertRaisesRegex(ValueError, 'Depth PSD.*face.*非表示'):
            read_depth(path, self.base)
        self.assertEqual(path.read_bytes(), raw)

    def test_hidden_parent_is_explained_even_when_face_itself_is_on(self):
        base = PSDImage.new('RGBA', (128, 128))
        group = Group.new(base, name='編集中')
        face = PixelLayer.frompil(Image.new('RGBA', (64, 64), 'orange'), group, name='face', left=32, top=16)
        group.visible = False
        self.assertTrue(face.visible)
        with self.assertRaisesRegex(ValueError, 'face.*非表示.*親グループ.*ON'):
            read_depth(self.depth(), base)
        self.assertFalse(group.visible)

    def test_multipart_keeps_depth_and_donors_separate_and_optional(self):
        uploads=self.root/'uploads';uploads.mkdir()
        files={'psd':('base.psd',b'base'),'original':('base.png',b'png'),'eyes_closed':('close.psd',b'closed'),'depth_psd':('depth.psd',b'depth')}
        with patch.object(server,'UPLOADS',uploads), patch.object(server,'start_job',return_value={'jobId':'test'}) as job, TestClient(server.app) as client:
            response=client.post('/api/import/hybrid',data={'open_features':'true'},files=files)
            self.assertEqual(response.status_code,200,response.text)
            self.assertEqual(job.call_args.kwargs['depth_psd'].read_bytes(),b'depth')
            self.assertEqual(job.call_args.kwargs['face_donors']['eyes_closed'].read_bytes(),b'closed')
            files.pop('depth_psd');client.post('/api/import/hybrid',data={'open_features':'true'},files=files)
            self.assertIsNone(job.call_args.kwargs['depth_psd'])
            files['depth_psd']=('bad.png',b'bad')
            self.assertEqual(client.post('/api/import/hybrid',data={'open_features':'true'},files=files).status_code,415)

    def test_deferred_import_dispatches_the_base_depth_after_restart(self):
        # The deferred record stores an index, not a donor or an external absolute path.
        targets=[server.DATA/'uploads'/'test'/name for name in ['base.psd','base.png','closed.psd','depth.psd']]
        options=dict(preset='detail',cleanup=False,alpha=12,motion_parts=True,source_open=True)
        with patch.object(assist,'ROOT',self.root/'assist'), patch.object(server,'start_job',return_value={'jobId':'test'}) as job:
            item=assist.register_input(targets,options,{'mouth_closed':None},depth_index=3)
            assist.start_input(item['input_id'])
            self.assertEqual(job.call_args.kwargs['depth_psd'],targets[3])
            self.assertEqual(job.call_args.kwargs['face_donors'],{'mouth_closed':targets[2]})
