import unittest
import uuid
from pathlib import Path
from unittest.mock import patch
from xml.etree import ElementTree as ET
from PIL import Image
from psd_tools import PSDImage
from psd_tools.api.layers import PixelLayer
from fastapi.testclient import TestClient
from studio.face_donors import read_donors, attach_donors
from studio import server


class FaceDonorTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(__file__).resolve().parents[1] / 'qa' / ('face-donors-' + uuid.uuid4().hex)
        self.root.mkdir()

    def fixture(self, name='face.psd', size=(64,64), eyes=True):
        psd=PSDImage.new('RGBA',size)
        PixelLayer.frompil(Image.new('RGBA',size,'red'),psd,name='body')
        PixelLayer.frompil(Image.new('RGBA',(12,7),'brown'),psd,name='mouth',left=23,top=38)
        if eyes:
            for side,x in [('r',9),('l',41)]:
                PixelLayer.frompil(Image.new('RGBA',(13,3),'black'),psd,name='eyelash-'+side,left=x,top=21)
        path=self.root/name;psd.save(path);return path

    def test_extract_only_requested_layers_and_keep_coordinates(self):
        path=self.fixture();data=read_donors({'eyes_closed':path,'i':path},(64,64))
        self.assertEqual(set(data['eyes_closed']['parts']),{'lash-r','lash-l'})
        self.assertEqual(set(data['i']['parts']),{'mouth'})
        self.assertEqual(data['i']['parts']['mouth']['bounds'],(23,38,35,45))
        self.assertEqual(data['i']['parts']['mouth']['image'].getpixel((0,0)),(165,42,42,255))

    def test_wrong_size_and_missing_lashes_fail_explicitly(self):
        path=self.fixture(eyes=False)
        with self.assertRaisesRegex(ValueError,'同じキャンバス'):
            read_donors({'i':path},(32,32))
        with self.assertRaisesRegex(ValueError,'lash-r'):
            read_donors({'eyes_closed':path},(64,64))

    def test_hidden_donor_names_the_file_kind_and_layer(self):
        path=self.fixture();psd=PSDImage.open(path)
        for layer in psd:
            if layer.name=='mouth':layer.visible=False
        psd.save(path);raw=path.read_bytes()
        with self.assertRaisesRegex(ValueError,'閉じ口の差分PSD.*mouth.*非表示.*親グループ'):
            read_donors({'mouth_closed':path},(64,64))
        self.assertEqual(path.read_bytes(),raw)

    def test_optional_shapes_are_registered_and_base_is_unchanged(self):
        path=self.fixture();source=path.read_bytes()
        data=read_donors({'mouth_closed':path,'i':path},(64,64))
        for name in ['parts','originals','work']:(self.root/name).mkdir()
        part=dict(id='p000',role='mouth',x=25,y=35,width=10,height=10,svgText='base')
        p=dict(parts=[part],settings={},conversion={})
        attach_donors(p,data,self.root,'light')
        self.assertEqual(part['svgText'],'base');self.assertEqual((part['x'],part['y'],part['width']),(25,35,10))
        self.assertEqual(set(part['mouthVariants']),{'i'})
        root=ET.fromstring(part['mouthVariants']['i'])
        self.assertEqual(root[0].get('transform'),'translate(-2 3)')
        self.assertEqual(root.get('overflow'),'visible')
        self.assertEqual(p['settings']['mouthTuning']['vowels']['i'],dict(width=1,height=1))
        self.assertEqual(part['closedSource'],'psd');self.assertEqual(path.read_bytes(),source)

    def test_multipart_dispatches_optional_psd_and_rejects_wrong_type(self):
        path=self.fixture();files={'psd':('base.psd',path.read_bytes()),'original':('base.png',b'fixture'),'mouth_i':('i.psd',path.read_bytes())}
        with patch.object(server,'start_job',return_value={'jobId':'test'}) as job, TestClient(server.app) as client:
            response=client.post('/api/import/hybrid',data={'open_features':'true'},files=files)
            self.assertEqual(response.status_code,200)
            self.assertEqual(set(job.call_args.kwargs['face_donors']),{'i'})
            self.assertEqual(job.call_args.kwargs['face_donors']['i'].read_bytes(),path.read_bytes())
            files['mouth_i']=('i.png',b'no')
            self.assertEqual(client.post('/api/import/hybrid',data={'open_features':'true'},files=files).status_code,415)

if __name__=='__main__':unittest.main()
