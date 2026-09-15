import io
import json
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch
from urllib.parse import parse_qs
from xml.etree import ElementTree as ET

import httpx
import numpy as np
from PIL import Image, ImageDraw
from fastapi.testclient import TestClient
from psd_tools import PSDImage
from psd_tools.api.layers import PixelLayer, Group
from studio.convert import convert_file, clean_alpha, role_for, tag
from studio import server

RUN = Path(__file__).resolve().parents[1] / 'qa' / ('tests-' + uuid.uuid4().hex)
RUN.mkdir(parents=True)


class PipelineTests(unittest.TestCase):
    def test_saved_project_names_are_compatible_in_both_directions(self):
        directory=RUN/'named-exports'
        directory.mkdir()
        with patch.object(server,'EXPORTS',directory), TestClient(server.app) as client:
            for name,alias in [('svg-through-motion.project.json','khaula-motion.project.json'),
                               ('khaula-motion.project.json','svg-through-motion.project.json')]:
                saved=client.post('/api/exports/'+name,content=b'{"name":"saved"}').json()
                self.assertEqual(client.get(saved['url']).content,b'{"name":"saved"}')
                other=saved['url'].rsplit('/',1)[0]+'/'+alias
                self.assertEqual(client.get(other).content,b'{"name":"saved"}')
                self.assertEqual(Path(saved['path']).name,name)
                self.assertFalse(Path(saved['path']).with_name(alias).exists())

    def test_mouth_discards_disconnected_faint_canvas_noise_but_keeps_edges(self):
        a=np.zeros((100,100,4),np.uint8)
        a[40:50,44:60]=[90,30,35,255]
        a[39,44:60]=[90,30,35,18]  # Connected antialiased fringe.
        a[0,0]=a[99,99]=[255,240,230,18]
        result=np.array(clean_alpha(Image.fromarray(a),'mouth'))
        self.assertEqual(Image.fromarray(result[:,:,3]).getbbox(),(44,39,60,50))
        np.testing.assert_array_equal(result[39:50,44:60],a[39:50,44:60])
        # A legitimately translucent mouth must still be retained.
        a[:,:,3]=np.minimum(a[:,:,3],24)
        self.assertTrue(np.array(clean_alpha(Image.fromarray(a),'mouth'))[45,50,3]>0)

    def test_offset_hidden_parent_and_layer_order(self):
        psd = PSDImage.new('RGBA', (80, 80))
        back = Image.new('RGBA', (20, 20))
        ImageDraw.Draw(back).rectangle((3, 4, 16, 17), fill=(200, 40, 20, 128))
        PixelLayer.frompil(back, psd, name='back hair', left=11, top=13)
        group = Group.new(psd, name='hidden group')
        PixelLayer.frompil(Image.new('RGBA', (8, 8), 'blue'), group, name='eyewhite-l', left=37, top=41)
        group.visible = False
        src = RUN / 'offset.psd'
        psd.save(src)
        project = convert_file(src, RUN / 'offset', alpha_threshold=0)
        self.assertEqual([p['name'] for p in project['parts']], ['back hair', 'eyewhite-l'])
        a, b = project['parts']
        self.assertEqual((a['x'], a['y'], a['width'], a['height']), (14, 17, 14, 14))
        self.assertFalse(b['visible'])
        reconstructed = Image.open(RUN / 'offset' / 'reconstructed.png')
        self.assertTrue(120 <= reconstructed.getpixel((18, 22))[3] <= 135, 'opacity must not be squared')
        self.assertEqual(reconstructed.getpixel((40, 45))[3], 0)
        root = ET.parse(RUN / 'offset' / 'assembled.svg').getroot()
        self.assertEqual(root[0].attrib['transform'], 'translate(14 17)')
        self.assertEqual(root[1].attrib['display'], 'none')
        self.assertEqual(len(list(root.iter(tag('image')))), 0)

    def test_cleanup_never_recolors_iris(self):
        image = Image.new('RGBA', (10, 10), (220, 210, 190, 255))
        self.assertTrue(np.array_equal(np.array(image), np.array(clean_alpha(image, 'iris-r', 12, True))))
        self.assertEqual(clean_alpha(image, 'lash-r', 12, True).getbbox(), None)

    def test_raster_preserves_transparency_as_vector_mask(self):
        src = RUN / 'alpha.png'
        im = Image.new('RGBA', (20, 20), (200, 60, 20, 0))
        ImageDraw.Draw(im).rectangle((5, 6, 15, 16), fill=(200, 60, 20, 128))
        im.save(src)
        p = convert_file(src, RUN / 'alpha', alpha_threshold=0)
        part = p['parts'][0]
        root = ET.parse(RUN / 'alpha' / part['svg']).getroot()
        mask = root.find('.//' + tag('mask'))
        self.assertIsNotNone(mask)
        self.assertEqual(mask.attrib['mask-type'], 'luminance')
        self.assertEqual((part['x'],part['y']), (5,6))
        self.assertFalse(list(root.iter(tag('image'))))
        self.assertEqual(Image.open(RUN/'alpha'/'reconstructed.png').getpixel((10,10))[3],128)
        with self.assertRaises(FileExistsError):
            convert_file(src, RUN / 'alpha')

    def test_roles_are_side_specific(self):
        self.assertEqual(role_for('ear-r'), 'ear-r')
        self.assertEqual(role_for('chest'), 'chest')
        self.assertEqual(role_for('topwear'), 'static')
        self.assertEqual(role_for('irides-r'), 'iris-r')
        self.assertEqual(role_for('eyelash-l'), 'lash-l')
        self.assertEqual(role_for('mouth'), 'mouth')
        self.assertEqual(role_for('irides'), 'static')


class APITests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(server.app)

    def test_origins_hosts_and_paths(self):
        self.assertEqual(self.client.get('/api/health').status_code,200)
        self.assertEqual(self.client.post('/api/import/sample',headers={'origin':'https://example.com'}).status_code,403)
        self.assertEqual(self.client.get('/api/health',headers={'host':'evil.example'}).status_code,400)
        self.assertEqual(self.client.get('/api/projects/invalid').status_code,404)
        self.assertEqual(self.client.post('/api/import',files={'file':('bad.html',b'test')}).status_code,415)
        self.assertEqual(self.client.post('/api/tts/models',json={'base_url':'http://example.com:5002'}).status_code,422)
        self.assertEqual(self.client.post('/api/tts/models',json={'base_url':'http://127.0.0.1:5002@evil.test'}).status_code,422)
        self.assertEqual(self.client.post('/api/tts/synthesize',json={'text':''}).status_code,422)

    def test_sbv2_protocol_query_parameters_and_wav(self):
        calls=[]
        wav=b'RIFF'+(40).to_bytes(4,'little')+b'WAVEfmt '+bytes(32)
        def handler(request):
            calls.append(request)
            if request.url.path == '/models/info':
                return httpx.Response(200,json={'7':{'spk2id':{'Khaula':2},'style2id':{'Happy':1}}})
            return httpx.Response(200,content=wav,headers={'content-type':'audio/wav'})
        real_client=httpx.AsyncClient
        def fake_client(**kwargs):
            return real_client(transport=httpx.MockTransport(handler),**kwargs)
        with patch.object(server.httpx,'AsyncClient',side_effect=fake_client):
            result=self.client.post('/api/tts/models',json={})
            self.assertIn('7',result.json())
            response=self.client.post('/api/tts/synthesize',json={'text':'こんにちは、ハウラよ。','model_id':7,'speaker_id':2,'style':'Happy','style_weight':1.5})
            self.assertEqual(response.status_code,200)
            self.assertEqual(response.content,wav)
        self.assertEqual(calls[-1].method,'POST')
        query=dict(calls[-1].url.params)
        self.assertEqual(query['text'],'こんにちは、ハウラよ。')
        self.assertEqual((query['model_id'],query['speaker_id'],query['style']),('7','2','Happy'))

    def test_exports_are_saved_without_overwriting(self):
        directory=RUN/'exports'
        directory.mkdir()
        with patch.object(server,'EXPORTS',directory):
            first=self.client.post('/api/exports/frame.png',content=b'first')
            second=self.client.post('/api/exports/frame.png',content=b'second')
            self.assertEqual(first.status_code,200)
            self.assertNotEqual(first.json()['path'],second.json()['path'])
            self.assertEqual(Path(first.json()['path']).read_bytes(),b'first')
            self.assertEqual(self.client.get(second.json()['url']).content,b'second')
            self.assertEqual(self.client.post('/api/exports/evil.exe',content=b'bad').status_code,422)

    def test_sbv2_unavailable_is_actionable(self):
        def handler(request):
            raise httpx.ConnectError('offline',request=request)
        real_client=httpx.AsyncClient
        with patch.object(server.httpx,'AsyncClient',side_effect=lambda **kw:real_client(transport=httpx.MockTransport(handler),**kw)):
            result=self.client.post('/api/tts/models',json={})
        self.assertEqual(result.status_code,502)
        self.assertIn('server_fastapi.py',result.json()['detail'])

    def test_fixed_frame_mp4_duration_and_frame_validation(self):
        import io, zipfile, subprocess, imageio_ffmpeg
        jpeg=io.BytesIO();Image.new('RGB',(64,64),'white').save(jpeg,format='JPEG')
        bundle=io.BytesIO()
        with zipfile.ZipFile(bundle,'w') as z:
            for i in range(15):z.writestr(f'frame{i:06d}.jpg',jpeg.getvalue())
        directory=RUN/'fixed-exports';directory.mkdir()
        with patch.object(server,'EXPORTS',directory):
            saved=self.client.post('/api/exports/khaula-frames.zip',content=bundle.getvalue()).json()
            response=self.client.post(saved['url']+'/loop-mp4')
            self.assertEqual(response.status_code,200,response.text)
            self.assertEqual(response.json()['frames'],15)
            result=subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-hide_banner','-i',response.json()['path'],'-f','null','-'],capture_output=True)
            self.assertEqual(result.returncode,0)
            self.assertIn('Duration: 00:00:00.50',result.stderr.decode(errors='replace'))
            png=io.BytesIO();Image.new('RGB',(64,64),'white').save(png,format='PNG')
            lossless=io.BytesIO()
            with zipfile.ZipFile(lossless,'w') as z:
                for i in range(15):z.writestr(f'frame{i:06d}.png',png.getvalue())
            png_saved=self.client.post('/api/exports/svg-through-frames.zip',content=lossless.getvalue()).json()
            png_result=self.client.post(png_saved['url']+'/loop-mp4')
            self.assertEqual(png_result.status_code,200,png_result.text)
            self.assertEqual(png_result.json()['frames'],15)
            bad=io.BytesIO()
            with zipfile.ZipFile(bad,'w') as z:z.writestr('../outside.jpg',jpeg.getvalue())
            saved=self.client.post('/api/exports/khaula-frames.zip',content=bad.getvalue()).json()
            self.assertEqual(self.client.post(saved['url']+'/loop-mp4').status_code,422)

    def test_mp4_transcodes_real_video_with_audio(self):
        import subprocess
        import imageio_ffmpeg
        exe=imageio_ffmpeg.get_ffmpeg_exe()
        source=RUN/'mp4-source.webm'
        subprocess.run([exe,'-nostdin','-loglevel','error','-f','lavfi','-i','color=white:s=64x64:r=24:d=0.5',
                        '-f','lavfi','-i','sine=frequency=440:duration=0.5','-c:v','libvpx-vp9','-c:a','libopus','-shortest',str(source)],check=True,capture_output=True)
        directory=RUN/'mp4-exports'
        directory.mkdir()
        with patch.object(server,'EXPORTS',directory):
            saved=self.client.post('/api/exports/clip.webm',content=source.read_bytes()).json()
            response=self.client.post(saved['url']+'/mp4')
            self.assertEqual(response.status_code,200,response.text)
            output=Path(response.json()['path'])
            self.assertEqual(output.name,'svg-through-motion.mp4')
            result=subprocess.run([exe,'-hide_banner','-i',str(output),'-f','null','-'],capture_output=True)
            self.assertEqual(result.returncode,0)
            info=result.stderr.decode('utf-8',errors='replace')
            self.assertIn('1080x1350',info)
            self.assertIn('30 fps',info)
            self.assertIn('Audio: aac',info)
            self.assertTrue(Path(saved['path']).is_file())
            self.assertEqual(self.client.post('/api/exports/invalid/clip.webm/mp4').status_code,404)


if __name__ == '__main__':
    unittest.main(verbosity=2)
