"""Read-only QA observer for the same pose stream consumed by OBS."""
import argparse
import asyncio
import json
from pathlib import Path
import time
import httpx
import websockets


async def main():
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=18765);parser.add_argument('--seconds',type=int,default=30)
    args=parser.parse_args();origin=f'http://127.0.0.1:{args.port}'
    values=httpx.get(origin+'/api/runtime/sessions',trust_env=False).json()
    sid=next(s['session_id'] for s in values if s['connected'])
    poses=[];start=time.monotonic()
    async with websockets.connect(f'ws://127.0.0.1:{args.port}/api/runtime/sessions/{sid}/socket/display',origin=origin) as ws:
        while time.monotonic()-start<args.seconds:
            try:message=json.loads(await asyncio.wait_for(ws.recv(),1))
            except asyncio.TimeoutError:continue
            if message.get('type')=='pose':poses.append({k:message['pose'].get(k) for k in ['blinkL','blinkR','browL','browR','mouth']})
    folder=Path(__file__).resolve().parent.parent/'.desktop-build/qa';folder.mkdir(exist_ok=True)
    (folder/'shortcut-poses.json').write_text(json.dumps(poses),encoding='utf-8')
    print(json.dumps(dict(frames=len(poses),smile=any(p['blinkL']==.35 and p['blinkR']==.35 for p in poses),wink=any(p['blinkL']==1 and p['blinkR']==0 for p in poses),brows=sorted(set(p['browL'] for p in poses if p['browL'] is not None)))))


if __name__=='__main__':asyncio.run(main())
