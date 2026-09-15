import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from studio import server


@unittest.skipUnless(os.name == 'nt', 'Windows Explorer integration')
class ExportRevealTests(unittest.TestCase):
    def test_reveal_selects_existing_export_and_rejects_missing_or_outside_paths(self):
        with tempfile.TemporaryDirectory(dir=server.ROOT/'qa') as temporary:
            root=Path(temporary)
            eid='a'*32
            directory=root/eid
            directory.mkdir()
            path=directory/'svg-through-motion.mp4'
            path.write_bytes(b'test')
            with patch.object(server, 'EXPORTS', root), patch.object(server.subprocess, 'Popen') as launch, TestClient(server.app) as client:
                response=client.post(f'/api/exports/{eid}/{path.name}/reveal')
                self.assertEqual(response.status_code, 200, response.text)
                self.assertTrue(response.json()['opened'])
                args=launch.call_args.args[0]
                self.assertEqual(args[1:], ['/select,', str(path.resolve())])
                self.assertFalse(launch.call_args.kwargs['shell'])
                launch.reset_mock()
                for url in [f'/api/exports/{eid}/missing.mp4/reveal', '/api/exports/not-an-id/x.mp4/reveal',
                            f'/api/exports/{eid}/..%5Coutside.mp4/reveal']:
                    self.assertEqual(client.post(url).status_code, 404)
                launch.assert_not_called()
                with patch.object(server.subprocess, 'Popen', side_effect=OSError('launch failed')):
                    response=client.post(f'/api/exports/{eid}/{path.name}/reveal')
                    self.assertEqual(response.status_code, 502)


if __name__ == '__main__':
    unittest.main()
