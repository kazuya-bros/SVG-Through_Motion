import time
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from studio import control, server


class ControlTests(unittest.TestCase):
    def test_upward_ear_pattern_is_accepted_by_both_settings_paths(self):
        settings={'earPattern':'up','ears':20,'earCycles':3}
        self.assertEqual(control.validate_motion_settings(settings),settings)
        self.assertEqual(control.Command(action='settings',settings=settings).settings,settings)

    def test_assist_command_validation(self):
        control.Command(action='assist', assist={'operation': 'inspect'})
        control.Command(action='assist', assist={'operation': 'start', 'operation_id': 'start_1'})
        valid = {'operation': 'edit', 'operation_id': 'edit_1', 'session_id': 'a'*8+'-'+'a'*4+'-'+'a'*4+'-'+'a'*4+'-'+'a'*12,
                 'revision': 0, 'part_id': 'p000', 'values': {'y': 3}}
        control.Command(action='assist', assist=valid)
        for value in ({'operation': 'shell'}, {'operation': 'start'}, {**valid, 'revision': True},
                      {**valid, 'values': {'y': True}}, {**valid, 'values': {'y': '3'}},
                      {**valid, 'values': {'svg': 1}}, {**valid, 'values': {'y': float('nan')}}):
            with self.assertRaises(ValueError):
                control.Command(action='assist', assist=value)

    def test_eye_through_hair_settings_are_typed_and_bounded(self):
        command=control.Command(action='settings', settings={'eyeThroughHair': True, 'eyeThroughHairStrength': .35})
        self.assertEqual(command.settings['eyeThroughHairStrength'], .35)
        for values in ({'eyeThroughHair': 'true'}, {'eyeThroughHairStrength': 1.1}, {'eyeThroughHairStrength': True}):
            with self.assertRaises(ValueError):
                control.Command(action='settings', settings=values)

    def setUp(self):
        self.bridge_patch = patch.object(control, 'bridge', control.Bridge())
        self.bridge_patch.start()
        self.client = TestClient(server.app)
        self.origin = {'origin': 'http://testserver'}

    def tearDown(self):
        self.client.close()
        self.bridge_patch.stop()

    def wait_result(self, cid):
        for _ in range(100):
            item = self.client.get('/api/control/commands/'+cid).json()
            if item['status'] != 'running':
                return item
            time.sleep(.01)
        self.fail('Result did not complete')

    def test_offline_and_invalid_inputs_are_not_accepted(self):
        self.assertEqual(self.client.post('/api/control/commands', json={'action': 'play'}).status_code, 409)
        for command in ({'action': 'shell'}, {'action': 'seek'}, {'action': 'pose', 'mouth': 2},
                        {'action': 'settings', 'settings': {'sway': -1}},
                        {'action': 'settings', 'settings': {'background': 'url(evil)'}},
                        {'action': 'settings', 'settings': {'blink': 'false'}},
                        {'action': 'load', 'project_id': '../secret'},
                        {'action': 'speak', 'text': '   '}, {'action': 'play', 'unknown': True}):
            with self.subTest(command=command):
                self.assertEqual(self.client.post('/api/control/commands', json=command).status_code, 422)
        self.assertEqual(self.client.post('/api/control/commands', json={'action': 'play'}, headers={'origin': 'https://evil.test'}).status_code, 403)

    def test_command_result_stop_and_busy(self):
        with self.client.websocket_connect('/api/control/socket/editor', headers=self.origin) as ws:
            accepted = self.client.post('/api/control/commands', json={'action': 'play'})
            self.assertEqual(accepted.status_code, 202)
            cid = accepted.json()['id']
            self.assertEqual(ws.receive_json()['id'], cid)
            self.assertEqual(self.client.post('/api/control/commands', json={'action': 'pause'}).status_code, 409)
            stop = self.client.post('/api/control/commands', json={'action': 'stop'})
            self.assertEqual(stop.status_code, 202)
            self.assertEqual(ws.receive_json()['command']['action'], 'stop')
            ws.send_json({'type': 'result', 'id': cid, 'error': 'cancelled'})
            self.assertEqual(self.wait_result(cid)['status'], 'failed')
            ws.send_json({'type': 'result', 'id': stop.json()['id'], 'result': {'stopped': True}})
            self.assertTrue(self.wait_result(stop.json()['id'])['result']['stopped'])

    def test_obs_snapshot_pose_reconnect_and_read_only(self):
        with self.client.websocket_connect('/api/control/socket/editor', headers=self.origin) as editor:
            with self.client.websocket_connect('/api/control/socket/obs', headers=self.origin) as obs:
                project = {'type': 'project', 'revision': 1, 'project': {'version': 1, 'parts': []}}
                editor.send_json(project)
                self.assertEqual(editor.receive_json(), {'type': 'published', 'revision': 1})
                self.assertEqual(obs.receive_json(), {'type': 'project', 'revision': 1})
                self.assertEqual(self.client.get('/api/control/project').json(), project)
                pose = {'type': 'pose', 'revision': 1, 'pose': {'mouth': .7}, 'state': {'playing': True}}
                editor.send_json(pose)
                self.assertEqual(obs.receive_json(), pose)
                obs.send_json({'type': 'pose', 'pose': {'mouth': 0}, 'state': {'playing': False}})
            with self.client.websocket_connect('/api/control/socket/obs', headers=self.origin) as later:
                self.assertEqual(later.receive_json(), {'type': 'project', 'revision': 1})
                self.assertEqual(later.receive_json(), pose)
            self.assertTrue(self.client.get('/api/control/status').json()['state']['playing'])

    def test_editor_ownership_origin_and_disconnect(self):
        for headers in ({}, {'origin': 'https://evil.test'}):
            with self.assertRaises(WebSocketDisconnect):
                with self.client.websocket_connect('/api/control/socket/editor', headers=headers):
                    pass
        with self.client.websocket_connect('/api/control/socket/editor', headers=self.origin) as editor:
            with self.assertRaises(WebSocketDisconnect):
                with self.client.websocket_connect('/api/control/socket/editor', headers=self.origin):
                    pass
            cid = self.client.post('/api/control/commands', json={'action': 'play'}).json()['id']
            editor.receive_json()
        self.assertEqual(self.wait_result(cid)['status'], 'failed')
        self.assertFalse(self.client.get('/api/control/status').json()['connected'])
        self.assertIsNone(control.bridge.snapshot)


if __name__ == '__main__':
    unittest.main()
