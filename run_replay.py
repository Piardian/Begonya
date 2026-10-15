"""
Begonya Manual Replay - Root Runner
"""
import sys
from pathlib import Path

# Add research directory to sys.path
root_dir = Path(__file__).resolve().parent
research_dir = root_dir / "research"
if str(research_dir) not in sys.path:
    sys.path.insert(0, str(research_dir))

import uvicorn
from manual_replay.web.server import app

if __name__ == "__main__":
    print("=" * 60)
    print("🌺 Begonya Manual Replay Web Server Starting...")
    print("Mode: ISOLATED RESEARCH REPLAY (LIVE_ORDERS = FALSE)")
    print("Web UI: http://127.0.0.1:8000")
    print("=" * 60)
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")
