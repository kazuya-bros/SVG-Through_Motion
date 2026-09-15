import io
import json
import unittest
from unittest.mock import patch, MagicMock

from tools.studio_control import main


class ClientTests(unittest.TestCase):
    def run_client(self, args, payloads):
        opener = MagicMock()
        responses = []
        for payload in payloads:
            response = MagicMock()
            response.__enter__.return_value = io.StringIO(json.dumps(payload))
            responses.append(response)
        opener.open.side_effect = responses
        with patch('sys.argv', ['studio_control.py', *args]), patch('sys.stdout', new_callable=io.StringIO) as output, \
                patch('urllib.request.build_opener', return_value=opener), patch('time.sleep'):
            code = main()
        return code, json.loads(output.getvalue()), opener

    def test_project_list_is_successful(self):
        code, out, _ = self.run_client(['projects'], [[{'id': 'abc', 'name': 'test'}]])
        self.assertEqual(code, 0)
        self.assertEqual(out[0]['name'], 'test')

    def test_command_waits_for_execution_and_posts_only_once(self):
        code, out, opener = self.run_client(['command', '{"action":"play"}'], [
            {'id': 'a'*32, 'status': 'running'}, {'id': 'a'*32, 'status': 'completed', 'result': {'playing': True}}])
        self.assertEqual(code, 0)
        self.assertTrue(out['result']['playing'])
        self.assertEqual([c.args[0].get_method() for c in opener.open.call_args_list], ['POST', 'GET'])

    def test_execution_failure_has_nonzero_exit(self):
        code, out, _ = self.run_client(['result', 'a'*32], [{'status': 'failed', 'error': 'disconnected'}])
        self.assertEqual(code, 1)
        self.assertEqual(out['error'], 'disconnected')
