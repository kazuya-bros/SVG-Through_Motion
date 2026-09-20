"""Assemble a portable app with notices, without user data or GPU models.

Run with the isolated build venv, after tauri build --no-bundle.
"""
from datetime import datetime
import importlib.metadata
import json
from pathlib import Path
import shutil
import subprocess
import zipfile

root=Path(__file__).resolve().parent.parent
version=json.loads((root/'package.json').read_text(encoding='utf-8'))['version']
folder=root/'output/desktop'/f'SVG-Through-Motion-{version}-windows-x64'
if folder.exists():
    folder=folder.with_name(folder.name+'-'+datetime.now().strftime('%Y%m%d-%H%M%S'))
folder.mkdir(parents=True)
shutil.copy2(root/'src-tauri/target/release/svg-through-desktop.exe',folder)
shutil.copytree(root/'.desktop-build/backend/svg-through-server',folder/'backend')
shutil.copy2(root/'docs/desktop-app.md',folder/'使い方.md')
shutil.copy2(root/'docs/agent-control.md',folder/'agent-control.md')
shutil.copy2(root/'docs/preview-edit-guides.md',folder/'preview-edit-guides.md')
shutil.copy2(root/'docs/hem-performance-save.md',folder/'hem-performance-save.md')
shutil.copy2(root/'docs/svg-layer-edit.md',folder/'svg-layer-edit.md')
shutil.copy2(root/'docs/rife-morph.md',folder/'rife-morph.md')
shutil.copy2(root/'docs/motion-links.md',folder/'motion-links.md')
shutil.copy2(root/'docs/preview-comparison.md',folder/'preview-comparison.md')
shutil.copy2(root/'docs/character-effects.md',folder/'character-effects.md')
shutil.copy2(root/'docs/stage-performance.md',folder/'stage-performance.md')
shutil.copy2(root/'docs/broadcast-look.md',folder/'broadcast-look.md')
shutil.copy2(root/'docs/quality-svg.md',folder/'quality-svg.md')
shutil.copy2(root/'docs/avatar-hotkeys.md',folder/'avatar-hotkeys.md')
shutil.copy2(root/'docs/effects-live-and-characters.md',folder/'effects-live-and-characters.md')
shutil.copy2(root/'THIRD_PARTY_NOTICES.md',folder)
shutil.copytree(root/'licenses',folder/'licenses')
notice=folder/'licenses/dependencies';notice.mkdir()
entries=[]
for dist in importlib.metadata.distributions():
    name=dist.metadata.get('Name','unknown');version=dist.version
    if name.lower() in ('pip','pyinstaller','pyinstaller-hooks-contrib','altgraph','pefile','pywin32-ctypes'):continue
    entries.append(f'Python: {name} {version} — {dist.metadata.get("License-Expression") or dist.metadata.get("License") or "See bundled license"}')
    for file in dist.files or []:
        if any(v in str(file).lower() for v in ('license','copying','copyright')) and len(file.parts)>1 and '.dist-info' in file.parts[0]:
            source=Path(dist.locate_file(file))
            if source.is_file():
                dest=notice/name/Path(*file.parts[1:]);dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,dest)
metadata=json.loads(subprocess.check_output(['cargo','metadata','--locked','--offline','--filter-platform','x86_64-pc-windows-msvc','--format-version','1','--manifest-path',str(root/'src-tauri/Cargo.toml')],cwd=root))
for package in metadata['packages']:
    name=package['name'];version=package['version'];entries.append(f'Rust: {name} {version} — {package.get("license") or "See bundled license"}')
    source=Path(package['manifest_path']).parent
    for file in source.iterdir():
        if file.is_file() and any(file.name.lower().startswith(v) for v in ('license','copying','copyright','notice')):
            dest=notice/(name+'-'+version)/file.name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(file,dest)
(notice/'INDEX.txt').write_text('\n\n'.join(entries),encoding='utf-8')
archive=Path(str(folder)+'.zip')
with zipfile.ZipFile(archive,'x',zipfile.ZIP_DEFLATED,compresslevel=6,strict_timestamps=False) as z:
    for file in folder.rglob('*'):
        if file.is_file():z.write(file,folder.name+'/'+file.relative_to(folder).as_posix())
print(json.dumps({'folder':str(folder),'zip':str(archive),'bytes':archive.stat().st_size}))
