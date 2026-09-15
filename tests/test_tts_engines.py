import json
import unittest
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient
from studio import server

WAV = b'RIFF' + (40).to_bytes(4, 'little') + b'WAVEfmt ' + bytes(32)


class TTSEnginesTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(server.app)

    def mock(self, handler):
        real = httpx.AsyncClient
        return patch.object(server.httpx, 'AsyncClient', side_effect=lambda **kw: real(transport=httpx.MockTransport(handler), **kw))

    def test_voicevox_and_aivis_use_style_id_and_preserve_query(self):
        for engine, port in [('voicevox', 50021), ('aivis', 10101)]:
            calls = []
            query = {'accent_phrases': [], 'speedScale': 1.17, 'engine_specific': {'keep': True}}
            def handler(request):
                calls.append(request)
                self.assertEqual(request.url.port, port)
                if request.url.path == '/speakers':
                    return httpx.Response(200, json=[{'name':'speaker','styles':[{'name':'normal','id':12345},{'name':'song','id':9,'type':'sing'}]}])
                if request.url.path == '/audio_query':
                    self.assertEqual(request.method, 'POST')
                    self.assertEqual(request.url.params['speaker'], '12345')
                    return httpx.Response(200, json=query)
                self.assertEqual(request.url.path, '/synthesis')
                self.assertEqual(json.loads(request.content), query)
                self.assertEqual(request.url.params['speaker'], '12345')
                return httpx.Response(200, content=WAV)
            with self.mock(handler):
                voices = self.client.post('/api/tts/voices', json={'engine':engine}).json()['voices']
                self.assertEqual(voices, [{'label':'speaker / normal','speaker_id':12345}])
                result = self.client.post('/api/tts/synthesize', json={'engine':engine,'speaker_id':12345,'text':'こんにちは'})
                self.assertEqual(result.status_code, 200)
                self.assertEqual(result.content, WAV)
            self.assertEqual(len(calls), 3)

    def test_irodori_openai_endpoints_auth_and_wav(self):
        def handler(request):
            self.assertEqual(request.headers['authorization'], 'Bearer test-token')
            if request.url.path == '/v1/models':
                return httpx.Response(200, json={'data':[{'id':'custom-model'}]})
            if request.url.path == '/v1/audio/voices':
                return httpx.Response(200, json={'data':[{'id':'sample','ref_wav':'private-path'}]})
            self.assertEqual(request.url.path, '/v1/audio/speech')
            self.assertEqual(json.loads(request.content), {'model':'custom-model','input':'こんにちは','voice':'sample','response_format':'wav','speed':1.0})
            return httpx.Response(200, content=WAV)
        body={'engine':'irodori','base_url':'http://127.0.0.1:8088/v1','api_key':'test-token'}
        with self.mock(handler):
            result=self.client.post('/api/tts/voices',json=body)
            self.assertEqual(result.json()['voices'],[{'label':'sample','model':'custom-model','voice':'sample'}])
            result=self.client.post('/api/tts/synthesize',json={**body,'model':'custom-model','voice':'sample','text':'こんにちは'})
            self.assertEqual(result.content,WAV)

    def test_sbv2_voice_catalog_and_no_foreign_parameters(self):
        def handler(request):
            if request.url.path == '/models/info':
                return httpx.Response(200,json={'2':{'spk2id':{'A':3},'style2id':{'Happy':0}}})
            self.assertNotIn('engine',request.url.params)
            self.assertNotIn('api_key',request.url.params)
            self.assertNotIn('authorization',request.headers)
            return httpx.Response(200,content=WAV)
        with self.mock(handler):
            item=self.client.post('/api/tts/voices',json={}).json()['voices'][0]
            self.assertEqual((item['model_id'],item['speaker_id'],item['style']),(2,3,'Happy'))
            self.assertEqual(self.client.post('/api/tts/synthesize',json={'text':'test','api_key':'never-send'}).status_code,200)

    def test_bad_responses_are_actionable(self):
        for response in [httpx.Response(200,text='bad'),httpx.Response(200,json={'invalid':True}),httpx.Response(401),httpx.Response(302,headers={'location':'http://example.com'})]:
            with self.mock(lambda r:response):
                result=self.client.post('/api/tts/voices',json={'engine':'voicevox'})
                self.assertEqual(result.status_code,502)
        with self.mock(lambda r:httpx.Response(200,content=b'not wav')):
            self.assertEqual(self.client.post('/api/tts/synthesize',json={'engine':'irodori','text':'test'}).status_code,502)

    def test_invalid_destinations_never_connect(self):
        with patch.object(server.httpx,'AsyncClient') as client:
            for url in ['https://127.0.0.1:8088','http://example.com:8088','http://127.0.0.1:8088@evil.test/v1','http://127.0.0.1:8088/private']:
                result=self.client.post('/api/tts/voices',json={'engine':'irodori','base_url':url})
                self.assertEqual(result.status_code,422)
            client.assert_not_called()

    def test_unknown_engine_rejected_instead_of_silent_sbv2(self):
        self.assertEqual(self.client.post('/api/tts/synthesize',json={'engine':'unknown','text':'test'}).status_code,422)
        self.assertEqual(self.client.post('/api/tts/synthesize',json={'engine':'browser','text':'test'}).status_code,422)

if __name__ == '__main__':
    unittest.main()
