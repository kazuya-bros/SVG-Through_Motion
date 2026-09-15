"""Packaged backend: parent stdin lifetime, dedicated loopback port, no browser."""
import argparse
import os
import socket
import sys
import threading


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=18765)
    args = parser.parse_args()
    if not os.environ.get('SVG_THROUGH_DESKTOP_TOKEN'):
        parser.error('Start this server from SVG-Through Desktop.')
    if not 1 <= args.port <= 65535:
        parser.error('Invalid port')
    import uvicorn
    from studio.server import app
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    if hasattr(socket, 'SO_EXCLUSIVEADDRUSE'):
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
    sock.bind(('127.0.0.1', args.port))
    server = uvicorn.Server(uvicorn.Config(app, host='127.0.0.1', port=args.port,
                            ws_max_size=50*1024**2, timeout_graceful_shutdown=3))

    def parent_lifetime():
        # Closing the native process closes this pipe, including on a crash.
        sys.stdin.buffer.read()
        from studio.material_inference import JOBS, cancel
        for jid, job in list(JOBS.items()):
            if job['state'] in ('queued', 'running'):
                cancel(jid)
        server.should_exit = True

    threading.Thread(target=parent_lifetime, daemon=True).start()
    try:
        server.run(sockets=[sock])
    finally:
        sock.close()


if __name__ == '__main__':
    main()
