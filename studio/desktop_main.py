"""Packaged backend: parent stdin lifetime, dedicated loopback port, no browser."""
import argparse
import os
import socket
import sys
import threading


def main():
    if '--quality-trace' in sys.argv[1:]:
        from studio.quality_trace import worker_main
        worker_main([arg for arg in sys.argv[1:] if arg != '--quality-trace'])
        return
    if '--mcp' in sys.argv[1:]:
        from studio.agent_mcp import main as mcp_main
        mcp_main([arg for arg in sys.argv[1:] if arg != '--mcp'])
        return
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=18765)
    args = parser.parse_args()
    if not os.environ.get('SVG_THROUGH_DESKTOP_TOKEN'):
        parser.error('Start this server from SVG-Through Desktop.')
    if not 1 <= args.port <= 65535:
        parser.error('Invalid port')
    # PSD compositing lazily imports scipy.interpolate's native extensions.
    # In the frozen Windows runtime, doing that first load from the conversion
    # worker can stall in _fitpack module initialization. Load the compositor on
    # the main thread before accepting requests (including donor PSD requests).
    import psd_tools.composite  # noqa: F401
    import uvicorn
    from studio.limits import PROJECT_BYTES
    from studio.server import app
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    if hasattr(socket, 'SO_EXCLUSIVEADDRUSE'):
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
    sock.bind(('127.0.0.1', args.port))
    server = uvicorn.Server(uvicorn.Config(app, host='127.0.0.1', port=args.port,
                            ws_max_size=PROJECT_BYTES, timeout_graceful_shutdown=3))

    def parent_lifetime():
        # Closing the native process closes this pipe, including on a crash.
        sys.stdin.buffer.read()
        from studio.quality_trace import stop_workers
        stop_workers()
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
