import time
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from studio import control, server


class ControlTests(unittest.TestCase):
    def test_mouth_stable_playback_modes_are_validated(self):
        for mode in ['stable', 'svg-frames-raw', 'svg-frames', 'grid']:
            self.assertEqual(control.Command(action='settings', settings={'rifeMouthMode': mode}).settings['rifeMouthMode'], mode)
        with self.assertRaises(ValueError):
            control.Command(action='settings', settings={'rifeEyesMode': 'stable'})

    def test_motion_links_command_validation(self):
        control.Command(action='motion_links', motion_links={'operation':'link','source_id':'p008','part_ids':['p006'],'mode':'attachment'})
        control.Command(action='motion_links', motion_links={'operation':'inspect'})
        control.Command(action='motion_links', motion_links={'operation':'link','source_id':'p008','part_ids':['p006'],'expected':{'p006':None}})
        for command in [{}, {'operation':'link'}, {'operation':'link','source_id':'p008','part_ids':['bad']}, {'operation':'link','source_id':'p008','part_ids':['p006','p006']}, {'operation':'unlink','source_id':'p008','part_ids':['p006'],'expected':{} }]:
            with self.assertRaises(ValueError):
                control.Command(action='motion_links',motion_links=command)

    def test_chest_region_is_available_and_validated_in_both_settings_paths(self):
        values={'chestRegionManual': True, 'chestCenterX': .52, 'chestCenterY': .4,
                'chestRadiusX': .1, 'chestRadiusY': .08}
        self.assertEqual(control.validate_motion_settings(values), values)
        self.assertEqual(control.Command(action='settings', settings=values).settings, values)
        for values in ({'chestRegionManual': 1}, {'chestCenterX': 1.1}, {'chestCenterY': float('nan')},
                       {'chestRadiusX': 0}, {'chestRadiusY': .51}, {'chestRadiusX': True}):
            for validate in (control.validate_motion_settings,
                             lambda v: control.Command(action='settings', settings=v)):
                with self.assertRaises(ValueError):
                    validate(values)

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

    def test_hair_follow_schema_rejects_retired_clothing_modes(self):
        from studio.control import MotionLinksCommand
        waist = dict(enabled=True, x=400, y=600, transition=40, amount=3, flutter=0)
        self.assertEqual(MotionLinksCommand(operation='link', source_id='p001', part_ids=['p009'], mode='rigid', anchor={'x': 100, 'y': 50}).mode, 'rigid')
        for kwargs in [dict(operation='configure', source_id='p008'), dict(operation='configure', source_id='p008', waist_motion={**waist, 'amount': 9}), dict(operation='link', source_id='p001', part_ids=['p009'], mode='mesh'), dict(operation='link', source_id='p001', part_ids=['p009'], anchor={'x': -1, 'y': 0})]:
            with self.subTest(kwargs=kwargs), self.assertRaises(ValueError):
                MotionLinksCommand(**kwargs)

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


class MotionRegionValidationTests(unittest.TestCase):
    def test_brush_setting_is_bounded(self):
        from studio.control import validate_motion_settings
        r={'cx':.5,'cy':.5,'rx':.2,'ry':.1,'mask':[0]*4096}
        self.assertEqual(validate_motion_settings({'chestMotionRegion':r})['chestMotionRegion'],r)
        for invalid in ({**r,'mask':[0]}, {**r,'cx':2}, {**r,'mask':[True]*4096}):
            with self.assertRaises(ValueError):validate_motion_settings({'chestMotionRegion':invalid})


class HeadMotionCommandTests(unittest.TestCase):
    def test_head_motion_contract(self):
        from studio.control import Command
        self.assertEqual(Command(action='head_motion',head_motion={'operation':'update','part_ids':['p001'],'tuning':{'amount':.5,'depth':1.2}}).head_motion.tuning.depth,1.2)
        for cmd in ({'operation':'update','tuning':{'amount':.5,'depth':1}}, {'operation':'update','part_ids':['p001'],'tuning':{'amount':2,'depth':1}}, {'operation':'update','neck_blend':0}):
            with self.assertRaises(ValueError):Command(action='head_motion',head_motion=cmd)

    def test_face_angles_settings(self):
        from studio.control import Command
        values={'headYawOffset':-.7,'headRollOffset':4,'headPitch':.5,'headIdle':False}
        self.assertEqual(Command(action='settings',settings=values).settings,values)
        for values in ({'headYawOffset':2},{'headRollOffset':9},{'headIdle':1}):
            with self.assertRaises(ValueError):Command(action='settings',settings=values)
