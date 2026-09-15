"""Separate immutable application resources from user-selected writable data."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = Path(os.environ.get('SVG_THROUGH_DATA_DIR', str(ROOT / 'data'))).resolve()
