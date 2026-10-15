@echo off
title Begonya Manual Replay Server
cd /d "%~dp0..\.."
set PYTHONPATH=%CD%\research
echo ========================================================
echo   Begonya Manual Replay - Isolated Research Web Server
echo   LIVE_ORDERS = FALSE
echo ========================================================
python research\manual_replay\run_server.py
pause
