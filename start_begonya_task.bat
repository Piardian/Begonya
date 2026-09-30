@echo off
chcp 65001 > nul
cd /d "%~dp0"
python orchestrator\start_begonya.py
