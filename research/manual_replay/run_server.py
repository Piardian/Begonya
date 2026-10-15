"""
Begonya Manual Replay - Server Runner
"""

import sys
import uvicorn
from pathlib import Path

# Add research root to sys.path
research_dir = Path(__file__).resolve().parent.parent
if str(research_dir) not in sys.path:
    sys.path.insert(0, str(research_dir))

from manual_replay.web.server import app

if __name__ == "__main__":
    print("=" * 60)
    print("🌺 Begonya Manual Replay Web Server Starting...")
    print("Mode: ISOLATED RESEARCH REPLAY (LIVE_ORDERS = FALSE)")
    print("Web UI: http://127.0.0.1:8000")
    print("=" * 60)
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")
