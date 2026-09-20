import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from fastapi.testclient import TestClient
from studio import server, project_saves as saves


class ProjectSaveTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir='output/verification')
        self.root = Path(self.temp.name).resolve()
        self.path = self.root / 'テストキャラ.project.json'
        self.patches = [patch.object(saves, 'EXPORTS', self.root/'exports'), patch.object(saves, 'tickets', {}), patch.object(saves, 'pick_save_path', return_value=self.path)]
        for item in self.patches:item.start()
        self.web = TestClient(server.app)
        self.body = json.dumps({'name': 'テストキャラ', 'parts': []}, ensure_ascii=False).encode()

    def tearDown(self):
        for item in reversed(self.patches):item.stop()
        self.temp.cleanup()

    def choose(self, request='test-save-123'):
        r = self.web.post('/api/project-saves/choose', json={'request_id': request, 'name': 'テストキャラ'})
        self.assertEqual(r.status_code, 200);return r.json()['ticket']

    def test_save_replay_and_internal_reopen(self):
        ticket = self.choose();self.assertEqual(self.choose(), ticket)
        r = self.web.post('/api/project-saves/'+ticket, content=self.body)
        self.assertEqual(r.status_code, 200);self.assertEqual(self.path.read_bytes(), self.body)
        self.assertEqual(self.web.post('/api/project-saves/'+ticket, content=self.body).json(), r.json())
        self.assertEqual(self.web.post('/api/project-saves/'+ticket, content=b'{"name":"other","parts":[]}').status_code, 409)
        self.assertEqual(self.web.get('/api/project-saves/'+ticket).json()['state'], 'saved')
        self.assertEqual(next((self.root/'exports').glob('*/*.json')).read_bytes(), self.body)

    def test_cancel_invalid_path_and_unapproved_write(self):
        with patch.object(saves, 'pick_save_path', return_value=None):self.assertIsNone(self.choose())
        self.assertEqual(self.web.post('/api/project-saves/missing', content=self.body).status_code, 409)
        self.assertEqual(self.web.post('/api/project-saves/choose', json={'request_id': 'path-inject', 'name': 'x', 'path': str(self.path)}).status_code, 422)
        self.assertFalse(self.path.exists())

    def test_overwrite_and_conflicting_file(self):
        self.path.write_text('original');ticket = self.choose()
        self.assertEqual(self.web.post('/api/project-saves/'+ticket, content=self.body).status_code, 200)
        other = self.choose('second-save-123');self.path.write_text('external edit')
        self.assertEqual(self.web.post('/api/project-saves/'+other, content=self.body).status_code, 409)
        self.assertEqual(self.path.read_text(), 'external edit')

    def test_failure_preserves_existing_and_retry(self):
        self.path.write_text('original');ticket = self.choose()
        with patch.object(saves.os, 'replace', side_effect=OSError('locked')):
            self.assertEqual(self.web.post('/api/project-saves/'+ticket, content=self.body).status_code, 502)
        self.assertEqual(self.path.read_text(), 'original');self.assertFalse(list(self.root.glob('*.tmp')))
        self.assertEqual(self.web.post('/api/project-saves/'+ticket, content=self.body).status_code, 200)

    def test_empty_name_and_corrupt_json(self):
        self.assertEqual(self.web.post('/api/project-saves/choose', json={'request_id': 'blank-name', 'name': '  '}).status_code, 422)
        ticket = self.choose();self.assertEqual(self.web.post('/api/project-saves/'+ticket, content=b'bad json').status_code, 422)
        self.assertFalse(self.path.exists())
