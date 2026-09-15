"""Run with the isolated desktop build venv; never include the GPU environment."""
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parent.parent
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
subprocess.run(args+[str(root/'studio/desktop_main.py')], cwd=root, check=True)
