import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

import numpy as np
from PIL import Image, ImageDraw
from psd_tools import PSDImage
from psd_tools.api.layers import PixelLayer
from fastapi.testclient import TestClient
from studio.hybrid import convert_hybrid
from studio import server


class HybridTests(unittest.TestCase):
    def setUp(self):
        self.root=Path(__file__).resolve().parents[1]/'qa'/('hybrid-tests-'+uuid.uuid4().hex)
        self.root.mkdir()

    def fixture(self, mouth_noise=False):
        image=Image.new('RGBA',(96,96),(244,225,205,255))
        ImageDraw.Draw(image).rectangle((0,65,95,95),fill=(30,80,100,255))
        image.save(self.root/'original.png')
        psd=PSDImage.new('RGBA',(96,96))
        PixelLayer.frompil(Image.new('RGBA',(96,96),'red'),psd,name='topwear')
        PixelLayer.frompil(Image.new('RGBA',(15,9),'white'),psd,name='eyewhite-r',left=24,top=30)
        PixelLayer.frompil(Image.new('RGBA',(5,8),'orange'),psd,name='irides-r',left=29,top=30)
        if mouth_noise:
            mouth=Image.new('RGBA',(96,96))
            ImageDraw.Draw(mouth).rectangle((44,49,53,50),fill='brown')
            mouth.putpixel((0,0),(200,200,200,18));mouth.putpixel((95,95),(200,200,200,18))
            PixelLayer.frompil(mouth,psd,name='mouth')
        else:
            PixelLayer.frompil(Image.new('RGBA',(10,2),'brown'),psd,name='mouth',left=44,top=49)
        psd.save(self.root/'face.psd')
        return image

    def test_original_body_is_preserved_and_only_psd_face_colors_used(self):
        original=self.fixture()
        p=convert_hybrid(self.root/'face.psd',self.root/'original.png',self.root/'result')
        self.assertNotIn('topwear',[part['name'] for part in p['parts']])
        result=np.array(Image.open(self.root/'result'/'reconstructed.png'))
        np.testing.assert_array_equal(result[65:,:,:],np.array(original)[65:,:,:])
        self.assertEqual(tuple(result[33,31]),(255,165,0,255))
        self.assertEqual(p['conversion']['mode'],'hybrid')
        self.assertEqual(len(p['rig']['hairWeights']),33**2)
        self.assertEqual(next(x for x in p['parts'] if x['role']=='iris-r')['x'],29)

    def test_hidden_required_features_explain_how_to_save_again(self):
        self.fixture()
        path = self.root/'face.psd'
        for name in ('eyewhite-r', 'mouth'):
            with self.subTest(name=name):
                psd = PSDImage.open(path)
                for layer in psd: layer.visible = layer.name != name
                psd.save(path); raw = path.read_bytes()
                with self.assertRaisesRegex(ValueError, name + '.*非表示.*ON'):
                    convert_hybrid(path, self.root/'original.png', self.root/name, source_open=True)
                self.assertEqual(path.read_bytes(), raw)

    def test_eyewear_keeps_alpha_follows_face_and_respects_front_hair_order(self):
        for segmented in (False,True):
            for glasses_on_top in (False,True):
                with self.subTest(segmented=segmented,glasses_on_top=glasses_on_top):
                    self.fixture()
                    psd=PSDImage.open(self.root/'face.psd')
                    for name in (('front hair','eyewear') if glasses_on_top else ('eyewear','front hair')):
                        color=(180,20,100,128) if name=='eyewear' else (20,30,40,255)
                        PixelLayer.frompil(Image.new('RGBA',(20,8),color),psd,name=name,left=22,top=28)
                    psd.save(self.root/'face.psd')
                    dest=self.root/f'glasses-{segmented}-{glasses_on_top}'
                    project=convert_hybrid(self.root/'face.psd',self.root/'original.png',dest,motion_parts=segmented)
                    parts=project['parts'];glass=next(p for p in parts if p.get('sourceLayerName')=='eyewear')
                    self.assertTrue(glass['independentAccessory'])
                    self.assertEqual(glass['role'],'static')
                    self.assertIn(glass['followPart'],[p['id'] for p in parts if p.get('faceBase') or p['role'].startswith('white-')])
                    pixel=Image.open(dest/glass['original']).convert('RGBA').getpixel((5,4))
                    self.assertTrue(all(abs(a-b)<=2 for a,b in zip(pixel,(180,20,100,128))))
                    self.assertGreater(parts.index(glass),max(i for i,p in enumerate(parts) if p['role'].startswith(('white-','iris-'))))
                    hair=next(p for p in parts if p['name']=='PSDの前髪')
                    self.assertEqual(parts.index(glass)>parts.index(hair),glasses_on_top)

    def test_hidden_eyewear_is_not_automatically_enabled(self):
        self.fixture();psd=PSDImage.open(self.root/'face.psd')
        layer=PixelLayer.frompil(Image.new('RGBA',(20,8),'purple'),psd,name='eyewear',left=22,top=28)
        layer.visible=False;psd.save(self.root/'face.psd')
        project=convert_hybrid(self.root/'face.psd',self.root/'original.png',self.root/'hidden-glasses',motion_parts=True)
        self.assertFalse(any(p.get('sourceLayerName')=='eyewear' for p in project['parts']))

    def test_legwear_survives_hybrid_conversion_without_being_baked_into_body(self):
        original=self.fixture();psd=PSDImage.open(self.root/'face.psd')
        PixelLayer.frompil(Image.new('RGBA',(30,20),'purple'),psd,name='legwear',left=32,top=70)
        PixelLayer.frompil(Image.new('RGBA',(34,8),'orange'),psd,name='bottomwear',left=30,top=68)
        psd.save(self.root/'face.psd')
        ImageDraw.Draw(original).rectangle((32,70,61,89),fill='purple')
        ImageDraw.Draw(original).rectangle((30,68,63,75),fill='orange')
        original.save(self.root/'original.png')
        dest=self.root/'legwear'
        project=convert_hybrid(self.root/'face.psd',self.root/'original.png',dest,motion_parts=True)
        parts=project['parts'];leg=next(p for p in parts if p.get('sourceLayerName')=='legwear')
        bottom=next(p for p in parts if p.get('sourceLayerName')=='bottomwear')
        self.assertTrue(leg['independentAccessory']);self.assertEqual(leg['deformGroup'],'legwear')
        self.assertLess(parts.index(leg),parts.index(bottom))
        self.assertTrue((dest/leg['svg']).is_file())
        hidden=Image.new('RGBA',original.size)
        for part in parts:
            if part is not leg:hidden.alpha_composite(Image.open(dest/part['original']).convert('RGBA'),(part['x'],part['y']))
        self.assertEqual(hidden.getpixel((40,80)),(255,0,0,255)) # PSD torso is revealed instead of purple source legs.
        self.assertEqual(hidden.getpixel((40,72)),(255,165,0,255)) # Shorts remain above the removed legs.

    def test_front_hair_uses_clean_psd_rgba_in_both_hybrid_modes(self):
        original=self.fixture()
        ImageDraw.Draw(original).rectangle((20,25,43,33),fill=(30,25,25,255))
        original.save(self.root/'original.png')
        psd=PSDImage.open(self.root/'face.psd')
        PixelLayer.frompil(Image.new('RGBA',(20,3),(30,25,25,255)),psd,name='eyelash-r',left=22,top=29)
        PixelLayer.frompil(Image.new('RGBA',(24,10),(210,200,190,160)),psd,name='front hair',left=20,top=24)
        psd.save(self.root/'face.psd')
        for segmented in (False,True):
            dest=self.root/('psd-front-'+str(segmented))
            p=convert_hybrid(self.root/'face.psd',self.root/'original.png',dest,motion_parts=segmented)
            front=next(v for v in p['parts'] if v['name']=='PSDの前髪')
            pixel=Image.open(dest/front['original']).convert('RGBA').getpixel((5,5))
            self.assertTrue(all(abs(a-b)<=2 for a,b in zip(pixel,(210,200,190,160))))
            self.assertFalse(any(v.get('blinkOverlay') or v.get('faceOverlay') for v in p['parts']))
            self.assertEqual(p['conversion']['frontHairSource'],'psd')
            if segmented:self.assertEqual(front['deformGroup'],'front')

    def test_headwear_is_independent_in_both_hybrid_modes_without_front_hair(self):
        original=self.fixture()
        ImageDraw.Draw(original).rectangle((4,4,15,13),fill='purple')
        original.save(self.root/'original.png')
        psd=PSDImage.open(self.root/'face.psd')
        PixelLayer.frompil(Image.new('RGBA',(12,10),'purple'),psd,name='headwear',left=4,top=4)
        psd.save(self.root/'face.psd')
        for segmented in (False,True):
            dest=self.root/('headwear-'+str(segmented))
            project=convert_hybrid(self.root/'face.psd',self.root/'original.png',dest,motion_parts=segmented)
            accessory=next(p for p in project['parts'] if p.get('independentAccessory'))
            self.assertEqual(accessory['sourceLayerName'],'headwear')
            self.assertEqual(accessory['deformGroup'],'core')
            self.assertEqual(Image.open(dest/accessory['original']).convert('RGBA').getpixel((5,5)),(128,0,128,255))
            # Removing the independent layer must reveal the PSD backing, not another baked ear.
            hidden=Image.new('RGBA',original.size)
            for part in project['parts']:
                if part is not accessory:hidden.alpha_composite(Image.open(dest/part['original']).convert('RGBA'),(part['x'],part['y']))
            self.assertEqual(hidden.getpixel((8,8)),(255,0,0,255))

    def test_open_mouth_uses_original_colors_with_psd_geometry_and_no_donor(self):
        image=self.fixture(mouth_noise=True)
        ImageDraw.Draw(image).rectangle((44,49,53,50),fill=(84,32,45,255))
        image.save(self.root/'original.png')
        p=convert_hybrid(self.root/'face.psd',self.root/'original.png',self.root/'source-mouth',source_open=True)
        mouth=next(x for x in p['parts'] if x['role']=='mouth')
        self.assertEqual(tuple(mouth[k] for k in ('x','y','width','height')),(44,49,10,2))
        self.assertEqual(mouth['mouthMode'],'source-open')
        self.assertNotIn('openSvgText',mouth)
        extracted=np.array(Image.open(self.root/'source-mouth'/mouth['original']))
        np.testing.assert_array_equal(extracted[0,0],(84,32,45,255))
        self.assertEqual(p['conversion']['mouthColorSource'],'original-image')

    def test_human_ear_is_independent_in_both_modes_without_hair(self):
        original=self.fixture()
        ImageDraw.Draw(original).rectangle((4,4,15,13),fill='purple')
        original.save(self.root/'original.png')
        psd=PSDImage.open(self.root/'face.psd')
        PixelLayer.frompil(Image.new('RGBA',(12,10),'purple'),psd,name='ears-r',left=4,top=4)
        psd.save(self.root/'face.psd')
        for segmented in (False,True):
            dest=self.root/('ear-'+str(segmented))
            project=convert_hybrid(self.root/'face.psd',self.root/'original.png',dest,motion_parts=segmented)
            ear=next(p for p in project['parts'] if p['role']=='ear-r')
            self.assertEqual(ear['sourceLayerName'],'ears-r')
            self.assertFalse(ear['earMotion'])
            hidden=Image.new('RGBA',original.size)
            for part in project['parts']:
                if part is not ear:hidden.alpha_composite(Image.open(dest/part['original']).convert('RGBA'),(part['x'],part['y']))
            self.assertEqual(hidden.getpixel((8,8)),(255,0,0,255))

    def test_base_psd_skin_repairs_eyes_without_closed_donors_in_both_modes(self):
        self.fixture()
        psd=PSDImage.open(self.root/'face.psd')
        PixelLayer.frompil(Image.new('RGBA',(96,96),(253,234,214,255)),psd,name='face')
        psd.save(self.root/'face.psd')
        for segmented in (False,True):
            dest=self.root/('skin-'+str(segmented))
            p=convert_hybrid(self.root/'face.psd',self.root/'original.png',dest,motion_parts=segmented,source_open=True)
            self.assertEqual(p['conversion']['eyePlateRepair'],'psd-skin-color-match-v1')
            self.assertGreater(p['conversion']['eyePlateRepairPixels'],30)
            self.assertFalse(any(v.get('closedSource')=='psd' for v in p['parts']))
            area=np.array(Image.open(dest/'work'/'eye-plate-repair.png'))>0
            self.assertFalse(area[60:].any())
            # A face donor with a pale offset is matched to the original skin.
            plate=np.array(Image.open(dest/'work'/'clean-plate.png'))
            self.assertLessEqual(np.abs(plate[33,30,:3].astype(int)-[244,225,205]).max(),1)

    def test_missing_face_layer_keeps_existing_fallback(self):
        self.fixture()
        p=convert_hybrid(self.root/'face.psd',self.root/'original.png',self.root/'without-face',source_open=True)
        self.assertEqual(p['conversion']['eyePlateRepair'],'unavailable')
        self.assertEqual(p['conversion']['eyePlateRepairPixels'],0)

    def test_motion_import_packages_both_sources_and_defaults_to_full_psd_sleeve(self):
        import base64,io,json
        self.fixture();psd=PSDImage.open(self.root/'face.psd')
        PixelLayer.frompil(Image.new('RGBA',(20,40),'yellow'),psd,name='handwear-l',left=70,top=50)
        psd.save(self.root/'face.psd');dest=self.root/'sources'
        p=convert_hybrid(self.root/'face.psd',self.root/'original.png',dest,motion_parts=True)
        arm=next(p for p in p['parts'] if p.get('deformGroup')=='arm-l')
        self.assertEqual(arm['artworkSource'],'psd')
        self.assertEqual(set(arm['artworkSources']),{'psd','original'})
        self.assertEqual(Image.open(dest/arm['original']).convert('RGBA').getpixel((5,25)),(255,255,0,255))
        for key,a in arm['artworkSources'].items():
            im=Image.open(io.BytesIO(base64.b64decode(a['originalUrl'].split(',')[1])))
            self.assertEqual(im.size,(a['width'],a['height']))
            self.assertIn('<',a['svgText']);self.assertGreater(a['paths'],0)
        loaded=json.loads((dest/'project.json').read_text(encoding='utf-8'))
        self.assertEqual(next(x for x in loaded['parts'] if x['id']==arm['id'])['artworkSources'],arm['artworkSources'])

    def test_import_requires_input_declaration_and_closed_sample_is_unavailable(self):
        self.fixture()
        with patch.object(server,'start_job') as job, TestClient(server.app) as client:
            r=client.post('/api/import/hybrid',files={'psd':('face.psd',(self.root/'face.psd').read_bytes()),'original':('original.png',(self.root/'original.png').read_bytes())})
            self.assertEqual(r.status_code,422)
            self.assertEqual(client.post('/api/import',files={'file':('original.png',(self.root/'original.png').read_bytes())}).status_code,422)
            self.assertEqual(client.post('/api/import/sample').status_code,422)
            self.assertEqual(client.post('/api/import/hybrid/sample').status_code,422)
            self.assertFalse(client.get('/api/health').json()['sampleAvailable'])
            job.assert_not_called()

    def test_mismatched_images_fail_without_rescaling(self):
        self.fixture();Image.new('RGBA',(48,48)).save(self.root/'wrong.png')
        with self.assertRaisesRegex(ValueError,'同じキャンバス'):
            convert_hybrid(self.root/'face.psd',self.root/'wrong.png',self.root/'rejected')
        self.assertFalse((self.root/'rejected').exists())

    def test_two_file_route_dispatches_both_files(self):
        self.fixture()
        with patch.object(server,'start_job',return_value={'jobId':'fixture'}) as job:
            with TestClient(server.app) as client:
                r=client.post('/api/import/hybrid',data={'open_features':'true'},files={'psd':('face.psd',(self.root/'face.psd').read_bytes()),'original':('original.png',(self.root/'original.png').read_bytes())})
                self.assertEqual(r.status_code,200)
                self.assertIs(job.call_args.kwargs['source_open'],True)
                args=job.call_args.args
                self.assertEqual(args[0].suffix,'.psd');self.assertEqual(args[4].suffix,'.png')
                client.post('/api/import/hybrid',data={'motion_parts':'true','open_features':'true'},files={'psd':('face.psd',(self.root/'face.psd').read_bytes()),'original':('original.png',(self.root/'original.png').read_bytes())})
                self.assertIs(job.call_args.args[5],True)
                self.assertEqual(client.post('/api/import/hybrid',files={'psd':('x.txt',b'x'),'original':('x.png',b'x')}).status_code,415)


if __name__=='__main__':unittest.main()
