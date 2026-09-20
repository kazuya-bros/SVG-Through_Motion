import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from xml.etree import ElementTree as ET

import numpy as np
from PIL import Image, ImageDraw
from fastapi.testclient import TestClient

from studio.convert import convert_file, trace_part
from studio.quality_trace import MAX_TRACE_PIXELS, PROFILE, iris_gradient, tag, trace_scale
from studio import materials, server


class QualityTraceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root/'work').mkdir()
        (self.root/'parts').mkdir()

    def tearDown(self):
        self.temp.cleanup()

    def test_scale_is_bounded_and_normal_art_uses_four(self):
        self.assertEqual(trace_scale((1280,1280)), 4)
        for size in [(4096,4096), (8192,2048), (512,2048), (1,1)]:
            scale = trace_scale(size)
            self.assertGreaterEqual(scale, 1)
            self.assertLessEqual((size[0]+4)*(size[1]+4)*scale**2, MAX_TRACE_PIXELS)

    def test_default_conversion_preserves_registration_and_source(self):
        image = Image.new('RGBA', (80,90))
        ImageDraw.Draw(image).ellipse((10,15,50,60), fill=(210,80,35,255))
        source = self.root/'input.png';image.save(source)
        before = source.read_bytes()
        project = convert_file(source,self.root/'converted')
        self.assertEqual(project['conversion']['preset'], 'quality')
        self.assertEqual(project['conversion']['traceProfile'], PROFILE)
        self.assertEqual(project['settings']['renderSource'], 'svg')
        part = project['parts'][0]
        self.assertEqual((part['x'],part['y'],part['width'],part['height']), (10,15,41,46))
        svg = ET.parse(self.root/'converted'/part['svg']).getroot()
        self.assertEqual(svg.get('viewBox'), '0 0 41 46')
        self.assertFalse(list(svg.iter(tag('image'))))
        self.assertEqual(before,source.read_bytes())

    def test_empty_parts_fail_without_output(self):
        with self.assertRaisesRegex(ValueError,'空'):
            trace_part(Image.new('RGBA',(20,20)),self.root/'work','empty','quality')
        self.assertFalse((self.root/'parts/empty.svg').exists())

    def test_iris_fit_accepts_different_hues_and_rejects_texture(self):
        for base in [np.array([90,45,20]),np.array([20,60,100]),np.array([80,20,100])]:
            a = np.zeros((32,24,4),dtype=np.uint8)
            for y in range(32):
                a[y,:,:3] = base + y*2
            a[:,:,3] = 255
            color = '#' + ''.join(f'{v:02x}' for v in base+32)
            paths = [ET.Element(tag('path'),fill=color,transform='translate(2,3)'),
                     ET.Element(tag('path'),fill='#101010'),ET.Element(tag('path'),fill='#ffffff')]
            defs = ET.Element(tag('defs'))
            self.assertEqual(iris_gradient(Image.fromarray(a), paths, defs, 'test', 4), 1)
            self.assertTrue(paths[0].get('fill').startswith('url('))
            self.assertEqual(paths[1].get('fill'),'#101010')
            self.assertEqual(paths[2].get('fill'),'#ffffff')
            a[::2,::2,:3] = [250,25,90]
            self.assertEqual(iris_gradient(Image.fromarray(a),paths,ET.Element(tag('defs')),'noise',4),0)

    def test_import_endpoint_defaults_and_rejects_bad_preset(self):
        data=io.BytesIO();Image.new('RGBA',(8,8),'blue').save(data,format='PNG')
        with TestClient(server.app) as client, patch.object(server,'start_job',return_value={'jobId':'test'}) as start:
            response=client.post('/api/import',data={'open_features':'true'},files={'file':('input.png',data.getvalue(),'image/png')})
            self.assertEqual(response.status_code,200)
            self.assertEqual(start.call_args.args[1],'quality')
        with TestClient(server.app) as client:
            response=client.post('/api/materials/'+'a'*32+'/convert?preset=invalid')
            self.assertEqual(response.status_code,422)

    def test_material_semantic_roles_reach_quality_converter(self):
        state=dict(id='a'*32,version=1,revision=0,name='Test',width=64,height=64,layers=[],warnings=[])
        colors=np.zeros((32,24,4),dtype=np.uint8)
        for y in range(32):colors[y,:,:3]=np.array([90,45,20])+2*y
        colors[:,:,3]=255
        materials.add_image(self.root,state,Image.fromarray(colors),'右の瞳','iris-r',12,14)
        project=materials.build_svg(self.root,state,self.root/'prepared','quality',lambda *_:None)
        part=project['parts'][0]
        self.assertEqual(part['role'],'iris-r')
        self.assertEqual(project['conversion']['traceProfile'],PROFILE)
        root=ET.parse(self.root/'prepared'/part['svg']).getroot()
        self.assertGreater(int(root.get('data-iris-gradients')),0)


if __name__ == '__main__':
    unittest.main()
