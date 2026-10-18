import json
import os
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

path = r"C:\Users\piard\.gemini\antigravity\brain\1ee6b02c-1bc0-4000-a259-3408e42bee6b\.system_generated\logs\transcript_full.jsonl"
with open(path, "r", encoding="utf-8") as f:
    for i, line in enumerate(f):
        if 7575 <= i <= 7595:
            data = json.loads(line)
            print(f"=== Line {i} | {data.get('type')} ===")
            content = data.get("content", "")
            if isinstance(content, str):
                print(content[:1500])
            print("="*40)
