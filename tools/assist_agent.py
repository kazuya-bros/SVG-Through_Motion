"""SVG-Through external-agent client: deterministic plumbing, visual judgment stays with the agent."""
import argparse
import json
import sys
import time
from pathlib import Path
from uuid import uuid4
from urllib.parse import urlparse

import httpx


class Client:
    def __init__(self, url):
        parsed=urlparse(url)
        if parsed.scheme!='http' or parsed.hostname not in ('127.0.0.1','localhost','::1') or parsed.path not in ('','/') or parsed.username or parsed.query or parsed.fragment:
            raise ValueError('loopback HTTP origin required')
        self.http=httpx.Client(base_url=url.rstrip('/'),trust_env=False,timeout=30)

    def request(self, method, path, **kwargs):
        result=self.http.request(method,path,**kwargs)
        if not result.is_success:raise RuntimeError(result.text)
        return result.json()

    def command(self, body):
        result=self.request('POST','/api/control/commands',json=body)
        deadline=time.monotonic()+600
        while result['status']=='running' and time.monotonic()<deadline:
            time.sleep(.2);result=self.request('GET','/api/control/commands/'+result['id'])
        if result['status']!='completed':raise RuntimeError(json.dumps(result,ensure_ascii=False))
        return result['result']

    def assist(self, operation, **kwargs):
        return self.command(dict(action='assist',assist=dict(operation=operation,operation_id=uuid4().hex,**kwargs)))


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url',default='http://127.0.0.1:8765')
    sub=parser.add_subparsers(dest='action',required=True)
    begin=sub.add_parser('begin');begin.add_argument('--input');begin.add_argument('--session');begin.add_argument('--images',action='store_true',help='Agent actually has image-generation tools')
    call=sub.add_parser('call');call.add_argument('json',help='Assist JSON or @UTF-8 file')
    sub.add_parser('inspect')
    importp=sub.add_parser('import-asset');importp.add_argument('request_id');importp.add_argument('png');importp.add_argument('--crop',required=True,help='left,top,right,bottom in generated image pixels');importp.add_argument('--extraction',choices=['alpha','dark_ink'],default='alpha');importp.add_argument('--placement-confirmed',action='store_true')
    args=parser.parse_args();client=Client(args.url)
    try:
        if args.action=='inspect':result=client.assist('inspect')
        elif args.action=='call':
            text=Path(args.json[1:]).read_text(encoding='utf-8-sig') if args.json.startswith('@') else args.json
            command=json.loads(text);command.setdefault('operation_id',uuid4().hex)
            result=client.command(dict(action='assist',assist=command))
        elif args.action=='import-asset':
            with open(args.png,'rb') as stream:
                result=client.request('POST',f'/api/assist/asset-requests/{args.request_id}/import',
                    files={'file':('donor.png',stream,'image/png')},data={'crop':json.dumps([int(v) for v in args.crop.split(',')]),'extraction':args.extraction,'placement_confirmed':str(args.placement_confirmed).lower()})
        elif args.action=='begin':
            if args.input:
                client.request('POST',f'/api/assist/inputs/{args.input}/start')
                deadline=time.monotonic()+600
                while True:
                    progress=client.request('GET',f'/api/assist/inputs/{args.input}')
                    if progress['state']=='done':break
                    if progress['state'] in ('error','interrupted') or time.monotonic()>deadline:raise RuntimeError(json.dumps(progress,ensure_ascii=False))
                    time.sleep(.5)
                client.command(dict(action='load',source='project',project_id=progress['projectId']))
                state=client.assist('start',mode='from_inputs',auto_apply=True,**progress.get('preferences',{}))
            elif args.session:state=client.assist('resume',session_id=args.session)
            else:state=client.assist('start',request_ai=True)
            sid=state['session_id']
            client.assist('claim',session_id=sid,capabilities={'inspect_images':True,'edit_project':True,'generate_images':args.images})
            review=client.assist('review',session_id=sid,revision=state['revision'])
            result=dict(session=client.assist('inspect')['session'],review=review,next='Open review PNGs, inspect actual appearance, edit or prepare_asset if needed, then finish with evidence. Do not mark pass without viewing images.')
        print(json.dumps(result,ensure_ascii=False,indent=2))
    finally:client.http.close()


if __name__=='__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    try:main()
    except Exception as exc:print(str(exc),file=sys.stderr);sys.exit(1)
