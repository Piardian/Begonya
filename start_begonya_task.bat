@echo off
chcp 65001 > nul
cd /d "%~dp0"
if exist smc_engine\data\runtime.lock del /f /q smc_engine\data\runtime.lock
if exist orchestrator\begonya_orchestrator.lock del /f /q orchestrator\begonya_orchestrator.lock
python orchestrator\start_begonya.py
