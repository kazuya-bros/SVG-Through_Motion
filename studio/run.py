"""Open the local UI only after the server is ready."""
import argparse
from dataclasses import dataclass
import socket
import threading
import time
import urllib.request
import webbrowser
import json
import uvicorn


@dataclass(frozen=True)
class Health:
    ready: bool
    detail: str = ''


def check_health(url, timeout=2):
    """Verify the response body, not just a 200 status; never use an OS proxy."""
    received_headers = False
    try:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(url + '/api/health', timeout=timeout) as response:
            received_headers = True
            body = response.read(4097)
            if len(body) > 4096:
                return Health(False, '別のサービスが応答しています（healthの本文が大きすぎます）。')
            data = json.loads(body)
            if isinstance(data, dict) and data.get('version') == '0.1.0' and 'presets' in data:
                return Health(True)
            return Health(False, 'このポートの応答はSVG-Through Motionの起動確認と一致しません。')
    except Exception as exc:
        if received_headers:
            return Health(False, f'HTTPヘッダーは受信しましたが、応答本文を正常に読み取れませんでした（{type(exc).__name__}）。')
        return Health(False, f'HTTP応答を受信できませんでした（{type(exc).__name__}）。')


def port_in_use(port):
    try:
        with socket.create_connection(('127.0.0.1', port), timeout=.5):
            return True
    except OSError:
        return False


def report_unreachable(url, health):
    print('\n[接続確認失敗] ' + health.detail, flush=True)
    print('URL: ' + url, flush=True)
    print('200 OKだけでは画面の受信完了を意味しません。ローカルHTTPを検査するソフトやプロキシを確認してください。', flush=True)
    print('自動での確認・ブラウザ起動はここで止めます。接続を直した後は上のURLを開いてください。\n', flush=True)


def open_when_started(server, url):
    # Uvicorn exposes startup completion directly. Do not send 100 health probes.
    for _ in range(150):
        if server.should_exit:
            return
        if server.started:
            health = check_health(url)
            if health.ready:
                webbrowser.open(url)
            else:
                report_unreachable(url, health)
            return
        time.sleep(.1)
    print('[起動待ち終了] サーバーの起動が完了していません。直前のエラーを確認してください。', flush=True)


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--port',type=int,default=8765)
    parser.add_argument('--open-browser',action='store_true')
    args=parser.parse_args()
    url=f'http://127.0.0.1:{args.port}'
    if not 1 <= args.port <= 65535:
        parser.error('--port must be 1..65535')
    if port_in_use(args.port):
        health = check_health(url)
        if health.ready:
            print('Studio is already running: '+url)
            if args.open_browser:
                webbrowser.open(url)
            return 0
        report_unreachable(url, health)
        print('このポートは使用中です。サーバーの二重起動は行いません。', flush=True)
        return 1
    from .limits import PROJECT_BYTES
    server = uvicorn.Server(uvicorn.Config('studio.server:app', host='127.0.0.1', port=args.port, ws_max_size=PROJECT_BYTES))
    if args.open_browser:
        threading.Thread(target=open_when_started,args=(server,url),daemon=True).start()
    server.run()
    return 0


if __name__=='__main__':
    raise SystemExit(main())
