"""AI/client-friendly local REST client. Uses Python's standard library only."""
import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from urllib.parse import urlparse


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default='http://127.0.0.1:8765')
    parser.add_argument('--timeout', type=float, default=600)
    parser.add_argument('--no-wait', action='store_true')
    parser.add_argument('action', choices=['status', 'projects', 'schema', 'command', 'result'])
    parser.add_argument('value', nargs='?', help='command JSON, @UTF-8 JSON file, or result ID')
    args = parser.parse_args()
    parsed = urlparse(args.url)
    if parsed.scheme != 'http' or parsed.hostname not in ('127.0.0.1', 'localhost', '::1') or parsed.path not in ('', '/') or parsed.username or parsed.password or parsed.query or parsed.fragment:
        parser.error('--url must be a loopback HTTP origin')
    origin = args.url.rstrip('/')
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def request(path, body=None):
        req = urllib.request.Request(origin+path, data=json.dumps(body, ensure_ascii=False).encode('utf-8') if body is not None else None,
                                     headers={'Content-Type': 'application/json'})
        with opener.open(req, timeout=15) as response:
            return json.load(response)

    if args.action == 'status':
        out = request('/api/control/status')
    elif args.action == 'projects':
        out = request('/api/projects')
    elif args.action == 'schema':
        out = request('/openapi.json')
    elif args.action == 'result':
        if not args.value or not __import__('re').fullmatch('[a-f0-9]{32}', args.value):
            parser.error('result needs a command ID')
        out = request('/api/control/commands/'+args.value)
    else:
        if not args.value:
            parser.error('command needs JSON or @file')
        value = args.value
        if value.startswith('@'):
            from pathlib import Path
            value = Path(value[1:]).read_text(encoding='utf-8-sig')
        out = request('/api/control/commands', json.loads(value))
        if not args.no_wait:
            deadline = time.monotonic()+args.timeout
            while out['status'] == 'running':
                if time.monotonic() >= deadline:
                    # Do not resend an operation whose execution result is unknown.
                    out['client_timeout'] = True
                    break
                time.sleep(.25)
                out = request('/api/control/commands/'+out['id'])
    print(json.dumps(out, ensure_ascii=False, indent=2))
    return 1 if isinstance(out, dict) and (out.get('status') == 'failed' or out.get('client_timeout')) else 0


if __name__ == '__main__':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.exit(main())
    except urllib.error.HTTPError as exc:
        print(exc.read().decode('utf-8', errors='replace'), file=sys.stderr)
        sys.exit(1)
    except (ValueError, OSError) as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
