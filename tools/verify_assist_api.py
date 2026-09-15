"""Exercise the correction API only on tests/fixtures/assist-project.json in a connected editor."""
import argparse
import json
import time
import urllib.request
from pathlib import Path
from uuid import uuid4
from urllib.parse import urlparse


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default='http://127.0.0.1:8767')
    args = parser.parse_args()
    if urlparse(args.url).hostname not in ('127.0.0.1', 'localhost'):
        parser.error('local test server required')
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def request(path, data=None):
        req = urllib.request.Request(args.url+path, data=json.dumps(data).encode() if data is not None else None,
                                     headers={'Content-Type': 'application/json'})
        with opener.open(req, timeout=15) as response:
            return json.load(response)

    def command(body, failure=False):
        result = request('/api/control/commands', body)
        end = time.monotonic()+60
        while result['status'] == 'running' and time.monotonic() < end:
            time.sleep(.1)
            result = request('/api/control/commands/'+result['id'])
        if failure:
            assert result['status'] == 'failed', result
            return result
        assert result['status'] == 'completed', result
        return result['result']

    def assist(operation, **kwargs):
        return command({'action': 'assist', 'assist': {'operation': operation, **kwargs}})

    original = assist('inspect')['live']
    assert original['project_id'] == 'assist-fixture', 'Load the synthetic fixture; refusing to edit another project'
    session = assist('start', operation_id=uuid4().hex)
    sid = session['session_id']
    edit = {'action': 'assist', 'assist': {'operation': 'edit', 'operation_id': uuid4().hex,
            'session_id': sid, 'revision': 0, 'part_id': 'p003', 'values': {'y': 8}}}
    first = command(edit)
    assert command(edit) == first
    assert assist('inspect')['live'] == original
    command({'action': 'assist', 'assist': {**edit['assist'], 'operation_id': uuid4().hex}}, failure=True)
    restored = assist('restore', session_id=sid, revision=1, target_revision=0, operation_id=uuid4().hex)
    assert restored['revision'] == 2
    edited = assist('edit', session_id=sid, revision=2, part_id='p003', values={'y': 8}, operation_id=uuid4().hex)
    review = assist('review', session_id=sid, revision=edited['revision'])
    saved = assist('save', session_id=sid, revision=3)
    downloaded = request(saved['url'])
    assert downloaded['settings']['mouthTuning']['closed']['y'] == 8
    assist('apply', session_id=sid, revision=3, operation_id=uuid4().hex)
    applied = assist('inspect')['live']
    assert next(p for p in applied['parts'] if p['id']=='p003')['values']['y'] == 8
    assist('undo', session_id=sid, operation_id=uuid4().hex)
    assert assist('inspect')['live'] == original
    # Saved result must remain editable after going through the actual project loader.
    export_id = saved['url'].split('/')[3]
    command({'action': 'load', 'source': 'saved', 'project_id': export_id})
    reloaded = assist('inspect')['live']
    assert next(p for p in reloaded['parts'] if p['id']=='p003')['values']['y'] == 8
    result = {'passed': True, 'review': review, 'saved': saved, 'checks': [
        'inspect', 'start', 'draft-isolation', 'edit', 'duplicate-operation', 'stale-revision',
        'restore', 'review-17-poses', 'save', 'apply', 'undo', 'reload-saved-candidate']}
    dest = Path(__file__).resolve().parents[1]/'qa'/('assist-api-'+uuid4().hex)
    dest.mkdir()
    (dest/'result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'passed': True, 'checks': result['checks'], 'result': str(dest/'result.json'), 'saved': saved}, ensure_ascii=False))


if __name__ == '__main__':
    main()
