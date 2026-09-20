import io
import random
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image
import imageio_ffmpeg
from studio import loop_export as api


def png(size=(32, 32)):
    out = io.BytesIO()
    Image.new('RGB', size, '#917cba').save(out, format='PNG')
    return out.getvalue()


class Sink:
    def __init__(self):
        self.bytes = 0
        self.closed = False
    def write(self, data):
        self.bytes += len(data)
        return len(data)
    def flush(self):
        pass
    def close(self):
        self.closed = True


class FakeEncoder:
    def __init__(self, args, **kwargs):
        self.stdin = Sink()
        self.output = Path(args[-1])
        self.returncode = None
    def poll(self):
        return self.returncode
    def wait(self, timeout=None):
        if self.returncode is None:
            self.output.write_bytes(b'mp4')
            self.returncode = 0
        return self.returncode
    def kill(self):
        self.returncode = -1


class LoopExportTests(unittest.TestCase):
    def setUp(self):
        imageio_ffmpeg.get_ffmpeg_exe()  # Resolve/probe before mocking only the encoder process.
        self.temp = tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parents[1] / 'qa')
        self.patch = patch.object(api, 'EXPORTS', Path(self.temp.name))
        self.patch.start()
        app = FastAPI()
        app.include_router(api.router)
        self.client = TestClient(app)
    def tearDown(self):
        for key in list(api.jobs):
            api.abort(key)
        self.client.close()
        self.patch.stop()
        self.temp.cleanup()
    def begin(self, frames, size=(32, 32)):
        r = self.client.post('/api/loop-exports', json=dict(frames=frames, width=size[0], height=size[1]))
        self.assertEqual(r.status_code, 200, r.text)
        return '/api/loop-exports/' + r.json()['id']
    def test_over_200mb_stream_has_no_zip_or_retained_frames(self):
        out = io.BytesIO()
        Image.frombytes('RGB', (1024, 1024), random.Random(7).randbytes(1024*1024*3)).save(out, format='PNG')
        data = out.getvalue()
        with patch.object(api.subprocess, 'Popen', FakeEncoder):
            base = self.begin(70, (1024, 1024))
            job = api.jobs[base.split('/')[-1]]
            for i in range(70):
                r = self.client.put(f'{base}/frames/{i}', content=data)
                self.assertEqual(r.status_code, 200, r.text)
            self.assertGreater(job['process'].stdin.bytes, 200*1024**2)
            r = self.client.post(base+'/finish')
            self.assertEqual(r.status_code, 200, r.text)
            self.assertEqual(r.json()['frames'], 70)
            self.assertFalse(api.jobs)
            self.assertFalse(list(Path(self.temp.name).rglob('*.png')))
            self.assertFalse(list(Path(self.temp.name).rglob('*.zip')))
    def test_order_validation_size_limit_incomplete_and_abort(self):
        with patch.object(api.subprocess, 'Popen', FakeEncoder):
            base = self.begin(2)
            self.assertEqual(self.client.put(base+'/frames/1', content=png()).status_code, 409)
            self.assertEqual(self.client.put(base+'/frames/0', content=png((16, 16))).status_code, 422)
            with patch.object(api, 'MAX_FRAME_BYTES', 32):
                self.assertEqual(self.client.put(base+'/frames/0', content=png()).status_code, 413)
            self.assertEqual(self.client.put(base+'/frames/0', content=png()).status_code, 200)
            self.assertEqual(self.client.post(base+'/finish').status_code, 409)
            process = api.jobs[base.split('/')[-1]]['process']
            self.assertEqual(self.client.delete(base).status_code, 200)
            self.assertTrue(process.stdin.closed)
            self.assertFalse(api.jobs)
    def test_real_encoder_produces_all_frames(self):
        base = self.begin(3)
        for i in range(3):
            self.assertEqual(self.client.put(f'{base}/frames/{i}', content=png()).status_code, 200)
        r = self.client.post(base+'/finish')
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(Path(r.json()['path']).name, 'svg-through-motion.mp4')
        reader = imageio_ffmpeg.read_frames(r.json()['path'], pix_fmt='rgb24')
        self.assertEqual(next(reader)['size'], (1080, 1350))
        self.assertEqual(sum(1 for _ in reader), 3)

    def test_transparent_webm_preserves_dimensions_alpha_and_timing(self):
        import subprocess
        out = io.BytesIO()
        im = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
        im.paste((180, 90, 40, 255), (8, 8, 24, 24))
        im.save(out, format='PNG')
        r = self.client.post('/api/loop-exports', json=dict(frames=40, width=32, height=32, format='webm-alpha', fps=12))
        self.assertEqual(r.status_code, 200, r.text)
        base = '/api/loop-exports/'+r.json()['id']
        for i in range(40):
            self.assertEqual(self.client.put(f'{base}/frames/{i}', content=out.getvalue()).status_code, 200)
        r = self.client.post(base+'/finish')
        self.assertEqual(r.status_code, 200, r.text)
        self.assertTrue(r.json()['path'].endswith('.webm'))
        decoded = subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-v', 'error', '-c:v', 'libvpx-vp9', '-i', r.json()['path'], '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], capture_output=True, check=True,
                                 creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0)).stdout
        self.assertEqual(len(decoded), 32*32*4*40)
        self.assertEqual(decoded[3], 0)
        self.assertEqual(decoded[(16*32+16)*4+3], 255)

    def test_balanced_webm_keeps_alpha_and_has_fixed_duration(self):
        import subprocess
        out=io.BytesIO();im=Image.new('RGBA',(64,64),(0,0,0,0));im.paste((180,90,40,255),(16,16,48,48));im.save(out,format='PNG')
        r=self.client.post('/api/loop-exports',json=dict(frames=30,width=64,height=64,format='webm-alpha',fps=30,quality='balanced'))
        self.assertEqual(r.status_code,200,r.text);base='/api/loop-exports/'+r.json()['id']
        for i in range(30):self.assertEqual(self.client.put(f'{base}/frames/{i}',content=out.getvalue()).status_code,200)
        r=self.client.post(base+'/finish');self.assertEqual(r.status_code,200,r.text)
        reader=imageio_ffmpeg.read_frames(r.json()['path']);metadata=next(reader);self.assertAlmostEqual(metadata['duration'],1,places=2);self.assertEqual(metadata['fps'],30);self.assertEqual(sum(1 for _ in reader),30)
        data=subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-v','error','-c:v','libvpx-vp9','-i',r.json()['path'],'-frames:v','1','-f','rawvideo','-pix_fmt','rgba','-'],capture_output=True,check=True,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0)).stdout
        self.assertEqual(data[3],0);self.assertEqual(data[(32*64+32)*4+3],255)


if __name__ == '__main__':
    unittest.main()
