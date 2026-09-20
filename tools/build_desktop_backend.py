"""Run with the isolated desktop build venv; never include the GPU environment."""
from pathlib import Path
import subprocess
import sys
import os
import hashlib

root = Path(__file__).resolve().parent.parent
model = Path(os.environ.get('SVG_THROUGH_RIFE_MODEL', str(root/'.desktop-build/models/rife.onnx')))
if not model.is_file() or hashlib.sha256(model.read_bytes()).hexdigest() != '0f9f5d969d5221db40a30cc1c4ca9e66d34a408d8bdf146256121ed0304a25a6':
    raise SystemExit('Set SVG_THROUGH_RIFE_MODEL to the audited Practical-RIFE v4.9.2 model before packaging.')
args = [sys.executable, '-m', 'PyInstaller', '--noconfirm', '--clean', '--onedir',
        '--name', 'svg-through-server', '--distpath', str(root/'.desktop-build/backend'),
        '--workpath', str(root/'.desktop-build/pyinstaller'),
        '--specpath', str(root/'.desktop-build'), '--paths', str(root),
        '--collect-all', 'imageio_ffmpeg', '--collect-all', 'psd_tools',
        '--collect-submodules', 'uvicorn', '--collect-submodules', 'websockets',
        '--collect-submodules', 'scipy', '--collect-submodules', 'studio']
for directory in ('web', 'tools', 'docs', 'licenses'):
    args += ['--add-data', str(root/directory) + ';' + directory]
args += ['--add-data', str(root/'THIRD_PARTY_NOTICES.md') + ';.']
args += ['--collect-all', 'onnxruntime', '--add-data', str(model) + ';models']
subprocess.run(args+[str(root/'studio/desktop_main.py')], cwd=root, check=True)
