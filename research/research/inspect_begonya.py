import os
import json
import sqlite3
import subprocess
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

def inspect_directory_structure(root_dir):
    print("=== DIZIN YAPISI ===")
    for root, dirs, files in os.walk(root_dir):
        # .git ve __pycache__ gibi gizli/geçici klasörleri atla
        dirs[:] = [d for d in dirs if not d.startswith('.') and d != '__pycache__']
        rel_path = os.path.relpath(root, root_dir)
        indent = "  " * (0 if rel_path == "." else rel_path.count(os.sep) + 1)
        print(f"{indent}[{os.path.basename(root)}/]")
        for f in files:
            print(f"{indent}  - {f}")

def inspect_git_history():
    print("\n=== GIT GECMISI (Son 5 Commit) ===")
    try:
        result = subprocess.run(
            ["git", "log", "-n", "5", "--oneline"],