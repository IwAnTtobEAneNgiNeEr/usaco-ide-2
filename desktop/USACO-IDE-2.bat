@echo off
title USACO IDE 2.0
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Khong tim thay Node.js. Cai dat tu https://nodejs.org roi chay lai.
  pause
  exit /b 1
)

REM Install Electron locally on first launch (one time).
if not exist "node_modules\electron" (
  echo Lan dau chay: dang cai Electron, vui long doi...
  call npm install --no-audit --no-fund
  if errorlevel 1 ( echo Cai dat that bai. & pause & exit /b 1 )
)

REM Make sure the branded icon exists.
if not exist "build\icon.ico" node scripts\make-icon.js

REM Launch the desktop app (no console window stays open).
start "" /b cmd /c "npx electron . >nul 2>nul"
exit /b 0
