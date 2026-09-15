"""Idempotent finishing step for the workspace UI source migration."""
from pathlib import Path

root=Path(__file__).resolve().parents[1]
p=root/'web/index.html'
s=p.read_text(encoding='utf-8').replace('/web/style.css?v=workspace-2','/web/workspace.css?v=workspace-2')
if '/web/mouth-workbench.css' not in s:
    s=s.replace('</head>','<link rel="stylesheet" href="/web/mouth-workbench.css?v=workspace-2"/></head>')
s=s.replace('うごきえ','SVG-Through Motion').replace('イラストに動きと声を','絵を分けて、動きをつくる。')
p.write_text(s,encoding='utf-8')
for rel in ['studio/server.py','studio/run.py','studio/__init__.py','Start-Studio.ps1','README.md','web/obs.html','web/obs.js']:
    p=root/rel
    s=p.read_text(encoding='utf-8').replace('Khaula Motion Studio','SVG-Through Motion').replace('Khaula Motion —','SVG-Through Motion —').replace('Khaula OBS —','SVG-Through Motion OBS —')
    p.write_text(s,encoding='utf-8')
