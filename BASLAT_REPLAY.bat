@echo off
title Begonya Manual Replay Web Server
cd /d "%~dp0"
echo ========================================================
echo   Begonya Manual Replay - Isolated Research Web Server
echo   LIVE_ORDERS = FALSE
echo   URL: http://127.0.0.1:8000
echo ========================================================
python research\manual_replay\run_server.py
pause
