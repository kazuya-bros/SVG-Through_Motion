"""Small fixed-API client; no TTS configuration, window launch, or automatic interruption."""
import argparse
import json
import sys
import uuid
import urllib.error
import urllib.parse
import urllib.request


def call(url, payload=None):
    data = json.dumps(payload, ensure_ascii=False).encode('utf-8') if payload is not None else None
    request = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(request, timeout=15) as response:
        return json.load(response)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default='http://127.0.0.1:8765')
    parser.add_argument('action', choices=['status', 'speak', 'replace', 'stop', 'result'])
    parser.add_argument('--text')
    parser.add_argument('--request-id')
    parser.add_argument('--expected-utterance-id')
    args = parser.parse_args()
    root = args.url.rstrip('/') + '/api/runtime'
    if args.action == 'status':
        result = call(root + '/status')
    elif args.action == 'result':
        if not args.request_id:
            parser.error('result requires --request-id')
        result = call(root + '/speech/' + urllib.parse.quote(args.request_id, safe=''))
    else:
        if args.action != 'stop' and (not args.text or not args.text.strip()):
            parser.error('speak/replace requires --text')
        if args.action in ('replace', 'stop') and not args.expected_utterance_id:
            parser.error('replace/stop requires the observed --expected-utterance-id')
        payload = {'request_id': args.request_id or str(uuid.uuid4()), 'action': args.action}
        if args.action != 'stop':
            payload['text'] = args.text
        if args.expected_utterance_id:
            payload['expected_utterance_id'] = args.expected_utterance_id
        # Return an existing receipt before checking the new active character.
        if args.request_id:
            try:
                receipt = call(root + '/speech/' + urllib.parse.quote(args.request_id, safe=''))
            except urllib.error.HTTPError as error:
                if error.code != 404:
                    raise
            else:
                # Server checks payload identity, including after a target switch.
                result = call(root + '/speech', payload)
                print(json.dumps(result, ensure_ascii=False))
                return 0
        state = call(root + '/status')
        if not all(state.get(k) for k in ('accepting', 'connected', 'ready')):
            raise ValueError('Character speech is unavailable: ' + json.dumps(state, ensure_ascii=False))
        if args.action == 'speak' and state.get('state') != 'idle':
            raise ValueError('Character is not idle; inspect status and decide whether to wait or replace.')
        if args.action != 'speak' and (state.get('current') or {}).get('id') != args.expected_utterance_id:
            raise ValueError('Current utterance changed; inspect status again.')
        print(json.dumps({'submitting': payload}, ensure_ascii=False), file=sys.stderr, flush=True)
        result = call(root + '/speech', payload)
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except urllib.error.HTTPError as error:
        print(json.dumps({'http_status': error.code, 'error': error.read().decode('utf-8', errors='replace')}, ensure_ascii=False), file=sys.stderr)
        raise SystemExit(1)
    except (ValueError, OSError) as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
