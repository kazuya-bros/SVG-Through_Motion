import io
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from studio import run


class LauncherTests(unittest.TestCase):
    def test_health_requires_valid_body(self):
        response = MagicMock()
        response.__enter__.return_value = response
        opener = MagicMock()
        opener.open.return_value = response
        with patch.object(run.urllib.request, 'build_opener', return_value=opener):
            response.read.return_value = b'{"version":"0.1.0","presets":{}}'
            self.assertTrue(run.check_health('http://localhost:8765').ready)
            response.read.return_value = b'[]'
            self.assertFalse(run.check_health('http://localhost:8765').ready)
            response.read.side_effect = TimeoutError()
            result = run.check_health('http://localhost:8765')
            self.assertFalse(result.ready)
            self.assertIn('HTTPヘッダーは受信', result.detail)

    def test_failed_probe_is_not_repeated_or_opened(self):
        server = SimpleNamespace(started=True, should_exit=False)
        with patch.object(run, 'check_health', return_value=run.Health(False, 'body timeout')) as probe, \
                patch.object(run.webbrowser, 'open') as browser, patch('sys.stdout', new_callable=io.StringIO) as output:
            run.open_when_started(server, 'http://localhost:8765')
        probe.assert_called_once()
        browser.assert_not_called()
        self.assertIn('body timeout', output.getvalue())

    def test_existing_unreachable_server_is_not_started_twice(self):
        with patch('sys.argv', ['studio.run']), patch.object(run, 'port_in_use', return_value=True), \
                patch.object(run, 'check_health', return_value=run.Health(False, 'body timeout')), \
                patch.object(run.uvicorn, 'Server') as server, patch('sys.stdout', new_callable=io.StringIO):
            self.assertEqual(run.main(), 1)
        server.assert_not_called()

    def test_success_opens_browser_once(self):
        server = SimpleNamespace(started=True, should_exit=False)
        with patch.object(run, 'check_health', return_value=run.Health(True)), patch.object(run.webbrowser, 'open') as browser:
            run.open_when_started(server, 'http://localhost:8765')
        browser.assert_called_once_with('http://localhost:8765')
