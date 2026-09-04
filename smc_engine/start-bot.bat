@echo off
title Swing BOS Core - Live Trading Bot
cd /d "%~dp0"
if exist data\runtime.lock del /f /q data\runtime.lock
echo ========================================================
echo   SWING BOS CORE - CANLI TRADING BOTU BASLATILIYOR
echo ========================================================
echo.
node dist/server/index.js
pause
