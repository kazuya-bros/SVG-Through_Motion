import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
from PIL import Image
from psd_tools import PSDImage
from psd_tools.api.layers import PixelLayer
from fastapi.testclient import TestClient

from studio import materials as m
from studio.server import app


class MaterialTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name)
        self.state = dict(id='a'*32,version=1,revision=0,name='Test',width=64,height=64,layers=[],warnings=[])

    def tearDown(self):
        self.tmp.cleanup()

    def part(self, name, color, tag='static', x=0, y=0):
        m.add_image(self.path,self.state,Image.new('RGBA',(16,16),color),name,tag,x,y)
        return self.state['layers'][-1]

    def test_repairs_merge_into_owner_but_source_is_immutable(self):
        face=self.part('face',(255,200,160,255),'face',8,8)
        repair=self.part('repair',(40,50,60,128),x=12,y=12)
        repair.update(parent=face['id'],repair=True)
        before=(self.path/face['asset']).read_bytes()
        names=m.export_psd(self.path,self.state,self.path/'fixed.psd')
        psd=PSDImage.open(self.path/'fixed.psd')
        self.assertEqual(len(names),1)
        self.assertEqual(len(psd),1)
        self.assertEqual((self.path/face['asset']).read_bytes(),before)
        got=np.array(psd.composite(force=True))
        self.assertEqual(tuple(got[13,13]),(147,125,110,255))
        self.assertEqual(tuple(got[9,9]),(255,200,160,255))

    def test_rejects_cycles_and_unknown_assets(self):
        a=self.part('a','red');b=self.part('b','blue');a['parent']=b['id'];b['parent']=a['id']
        edit=m.Edit(revision=0,name='Test',layers=self.state['layers'])
        with self.assertRaisesRegex(ValueError,'循環'):
            m.validate(self.state,edit,self.path)
        a['parent']=b['parent']=None
        edit=m.Edit(revision=0,name='Test',layers=self.state['layers'])
        edit.layers[0].asset='c'*32+'.png'
        with self.assertRaisesRegex(ValueError,'画像'):
            m.validate(self.state,edit,self.path)

    def test_closed_art_and_follow_survive_svg_handoff(self):
        face=self.part('face',(230,190,140,255),'face',24,15)
        self.part('open',(90,20,20,255),'mouth',27,30)
        self.part('closed',(40,20,20,255),'mouth-closed',27,30)
        glasses=self.part('glasses',(0,0,0,255),'eyewear',26,23)
        glasses.update(parent=face['id'],depth=.2)
        # Use real VTracer to catch registration and on-disk SVG inconsistencies.
        project=m.build_svg(self.path,self.state,self.path/'svg','light',lambda *_:None)
        mouth=next(p for p in project['parts'] if p['role']=='mouth')
        self.assertEqual(mouth['closedSource'],'psd')
        self.assertIn('translate(0 0)',mouth['closedSvgText'])
        self.assertEqual(len(project['parts']),3)
        self.assertEqual(project['settings']['renderSource'],'svg')
        self.assertEqual(project['parts'][-1]['followPart'],project['parts'][0]['id'])
        self.assertEqual(project['parts'][-1]['attachmentDepth'],.2)
        self.assertTrue(project['rig']['segmented'])
        self.assertEqual(project['conversion']['materialRevision'],0)

    def test_psd_candidate_keeps_adopted_parts_and_separates_eyes(self):
        self.part('adopted','red','face')
        psd=PSDImage.new('RGBA',(64,64));im=Image.new('RGBA',(64,16));im.paste((255,255,255,255),(10,0,20,10));im.paste((255,255,255,255),(40,0,50,10))
        PixelLayer.frompil(im,psd,name='eyewhite',top=10)
        source=self.path/'candidate.psd';psd.save(source)
        m.add_source(self.path,self.state,source,candidate=True)
        self.assertTrue(self.state['layers'][0]['visible'])
        self.assertEqual([p['tag'] for p in self.state['layers'][1:]],['white-l','white-r'])
        self.assertTrue(all(not p['visible'] for p in self.state['layers'][1:]))
        self.assertEqual(m.infer_tag('eyelash-l'),'lash-l')
        self.assertEqual(m.infer_tag('handwear_r'),'handwear-r')
        self.assertEqual(m.infer_tag('white-l'),'white-l')
        self.assertEqual(m.infer_tag('front hair--'+'a'*32),'front hair')

    def test_legwear_and_footwear_keep_independent_groups_after_correction(self):
        self.part('body','blue','topwear',24,15)
        self.part('legs','purple','legwear',24,30)
        self.part('shoes','orange','footwear',24,44)
        project=m.build_svg(self.path,self.state,self.path/'svg','light',lambda *_:None)
        for key in ('legwear','footwear'):
            part=next(p for p in project['parts'] if p.get('sourceLayerName')==key)
            self.assertTrue(part['independentAccessory'])
            self.assertEqual(part['deformGroup'],key)
            self.assertTrue((self.path/'svg'/part['svg']).is_file())

    def test_psd_anatomical_names_map_to_screen_sides(self):
        psd=PSDImage.new('RGBA',(64,64))
        PixelLayer.frompil(Image.new('RGBA',(8,8),'red'),psd,name='eyelash-l',left=42,top=12)
        PixelLayer.frompil(Image.new('RGBA',(8,8),'red'),psd,name='eyelash-r',left=14,top=12)
        source=self.path/'sides.psd';psd.save(source);m.add_source(self.path,self.state,source)
        self.assertEqual([p['tag'] for p in self.state['layers']],['lash-r','lash-l'])

    def test_revision_conflict_does_not_replace_state(self):
        client=TestClient(app)
        self.part('face','red','face')
        root=self.path/self.state['id'];root.mkdir()
        for p in self.state['layers']:
            (root/p['asset']).write_bytes((self.path/p['asset']).read_bytes())
        m.persist(root,self.state)
        with patch.object(m,'STORE',self.path):
            body=dict(revision=0,name='Saved',layers=self.state['layers'])
            r=client.put('/api/materials/'+self.state['id'],json=body)
            self.assertEqual(r.status_code,200,r.text)
            r=client.put('/api/materials/'+self.state['id'],json=body)
            self.assertEqual(r.status_code,409)
            self.assertEqual(m.read(self.state['id'])['revision'],1)
            self.assertEqual(len(list((root/'history').glob('*.json'))),2)

    def test_cut_restore_bundle_and_region_keep_pixels_and_coordinates(self):
        import io
        import zipfile
        part=self.part('face','red','face',8,10);part['scale']=2
        root=self.path/self.state['id'];root.mkdir()
        original=(self.path/part['asset']).read_bytes();(root/part['asset']).write_bytes(original);m.persist(root,self.state)
        client=TestClient(app)
        with patch.object(m,'STORE',self.path):
            body=dict(revision=0,part_id=part['id'],rect=[2,3,8,9],cut_source=True,instruction='線をつなぐ')
            region=client.post('/api/materials/'+self.state['id']+'/assist-region',json=body)
            self.assertEqual(region.status_code,200,region.text)
            with zipfile.ZipFile(io.BytesIO(client.get(region.json()['url']).content)) as z:
                self.assertIn('線をつなぐ',z.read('request.md').decode())
                self.assertEqual(Image.open(io.BytesIO(z.read('region.png'))).size,(6,6))
            result=client.post('/api/materials/'+self.state['id']+'/extract',json=body)
            self.assertEqual(result.status_code,200,result.text)
            state=result.json();self.assertEqual(len(state['layers']),2)
            self.assertEqual((state['layers'][1]['x'],state['layers'][1]['y']),(12,16))
            self.assertEqual((root/part['asset']).read_bytes(),original)
            im=m.checked_image(root/state['layers'][0]['asset']);self.assertEqual(im.getpixel((3,4))[3],0)
            exported=client.post('/api/materials/'+state['id']+'/export').json()
            bundle=client.get(exported['bundle']).content
            restored=client.post('/api/materials/restore',files={'file':('material.zip',bundle,'application/zip')})
            self.assertEqual(restored.status_code,200,restored.text)
            self.assertNotEqual(restored.json()['id'],state['id'])
            self.assertEqual(restored.json()['layers'],state['layers'])
            # Undo can refer to retained immutable assets after cutting.
            undo=client.put('/api/materials/'+state['id'],json=dict(revision=1,name='Undo',layers=self.state['layers']))
            self.assertEqual(undo.status_code,200,undo.text)


    def test_brush_cut_preserves_unpainted_pixels_alpha_and_follow(self):
        import base64
        import io
        part=self.part('arm',(20,40,60,200),'handwear-l',8,10);part['scale']=2
        root=self.path/self.state['id'];root.mkdir()
        original=(self.path/part['asset']).read_bytes();(root/part['asset']).write_bytes(original)
        m.persist(root,self.state)
        mask=Image.new('RGBA',(16,16))
        mask.putpixel((2,3),(255,255,255,255));mask.putpixel((6,8),(255,255,255,128))
        stream=io.BytesIO();mask.save(stream,format='PNG')
        body=dict(revision=0,part_id=part['id'],rect=[0,0,16,16],cut_source=True,
                  mask_png='data:image/png;base64,'+base64.b64encode(stream.getvalue()).decode(),name='指先')
        with patch.object(m,'STORE',self.path):
            client=TestClient(app);r=client.post('/api/materials/'+self.state['id']+'/extract',json=body)
            self.assertEqual(r.status_code,200,r.text)
            result=r.json();base,cut=result['layers']
            self.assertEqual((cut['name'],cut['x'],cut['y'],cut['scale'],cut['parent']),('指先',12,16,2,part['id']))
            a=m.checked_image(root/base['asset']);b=m.checked_image(root/cut['asset'])
            self.assertEqual(b.size,(5,6))
            self.assertEqual(a.getpixel((2,3))[3],0)
            self.assertEqual(b.getpixel((0,0)),(20,40,60,200))
            self.assertEqual(a.getpixel((6,8))[3]+b.getpixel((4,5))[3],200)
            self.assertEqual(b.getpixel((4,5))[3],100)
            self.assertEqual(a.getpixel((4,5)),(20,40,60,200))
            self.assertEqual(b.getpixel((2,2))[3],0)
            self.assertEqual((root/part['asset']).read_bytes(),original)
            # A retried request cannot duplicate a layer with the stale revision.
            self.assertEqual(client.post('/api/materials/'+self.state['id']+'/extract',json=body).status_code,409)

    def test_brush_mask_validation_and_copy_respect_existing_crop(self):
        import base64
        import io
        part=self.part('face','red','face');part['crop']=[4,4,12,12]
        root=self.path/self.state['id'];root.mkdir();(root/part['asset']).write_bytes((self.path/part['asset']).read_bytes());m.persist(root,self.state)
        def encoded(image):
            stream=io.BytesIO();image.save(stream,format='PNG');return base64.b64encode(stream.getvalue()).decode()
        body=dict(revision=0,part_id=part['id'],rect=[0,0,16,16],cut_source=False)
        with patch.object(m,'STORE',self.path):
            client=TestClient(app)
            for mask in ('invalid',encoded(Image.new('L',(2,2),255)),encoded(Image.new('L',(16,16),0))):
                r=client.post('/api/materials/'+self.state['id']+'/extract',json={**body,'mask_png':mask})
                self.assertEqual(r.status_code,422,r.text)
                self.assertEqual(m.read(self.state['id'])['revision'],0)
            mask=Image.new('L',(16,16));mask.paste(255,(1,1,7,7))
            r=client.post('/api/materials/'+self.state['id']+'/extract',json={**body,'mask_png':encoded(mask)})
            self.assertEqual(r.status_code,200,r.text)
            base,cut=r.json()['layers'];self.assertEqual(base,part)
            self.assertEqual((cut['x'],cut['y']),(4,4));self.assertEqual(m.checked_image(root/cut['asset']).size,(3,3))


if __name__=='__main__':unittest.main()
