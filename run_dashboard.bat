@echo off
title 6U CubeSat Telemetry & 440 MHz LoRa Ground Station
echo ================================================================
echo   6U CUBESAT TELEMETRY ^& 440 MHz LoRa GROUND STATION DASHBOARD
echo   Initializing Node.js Server ^& Web Interface...
echo ================================================================

cd /d "%~dp0"

:: Start browser after brief pause
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:3000"

:: Launch Ground Station Server
node server.js
pause
