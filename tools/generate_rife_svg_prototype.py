"""Run the existing audited RIFE model, saving references and fitted SVG tracks.

Use the build venv with optional ONNX Runtime in .desktop-build/rife-prototype-deps.
Outputs are written to a new directory; source models and source projects are read-only.
"""
import argparse
import base64
import io
import json
from pathlib import Path
import subprocess
import sys
from datetime import datetime

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT));sys.path.insert(0,str(ROOT/'.desktop-build/rife-prototype-deps'))
from studio.rife_keyframes import RifeRunner,generate_track,MODEL_SHA256

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--model',type=Path,required=True);parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()
    if args.output.exists():raise ValueError('Choose a new output directory; existing results are never overwritten.')
    runner=RifeRunner(args.model)
    source=subprocess.check_output(['node','--input-type=module','-e',"import {demoTrack} from './web/svg-keyframes.js'; console.log(JSON.stringify({eye:demoTrack('eye'),mouth:demoTrack('mouth')}));"],cwd=ROOT,text=True)
    tracks=json.loads(source);result={'version':1,'model':'Practical-RIFE v4.9.2 / PachiPakuGen ONNX','modelSha256':MODEL_SHA256,'provider':'CPUExecutionProvider','created':datetime.now().isoformat(),'cases':{}}
    args.output.mkdir(parents=True)
    for kind,track in tracks.items():
        print(json.dumps({'phase':'inference-and-fit','kind':kind}),flush=True)
        fitted,images,metrics=generate_track(runner,track,kind);references=[]
        for i,image in enumerate(images):
            image.save(args.output/f'{kind}-{i}.png');data=io.BytesIO();image.save(data,format='PNG')
            references.append('data:image/png;base64,'+base64.b64encode(data.getvalue()).decode())
        result['cases'][kind]={'track':fitted,'references':references,'metrics':metrics}
        (args.output/f'{kind}-track.json').write_text(json.dumps({'kind':kind,'track':fitted},indent=2),encoding='utf-8')
        print(json.dumps({'kind':kind,'metrics':metrics}),flush=True)
    (args.output/'dataset.json').write_text(json.dumps(result,separators=(',',':')),encoding='utf-8')
    print(json.dumps({'dataset':str(args.output/'dataset.json')}),flush=True)

if __name__=='__main__':main()
