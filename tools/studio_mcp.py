"""Source entry point: python tools/studio_mcp.py --url http://127.0.0.1:18765."""
import sys
from pathlib import Path

if __name__ == '__main__':
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from studio.agent_mcp import main
    main()
