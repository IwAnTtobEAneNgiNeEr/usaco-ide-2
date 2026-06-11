@echo off
setlocal enabledelayedexpansion
title USACO IDE 2.0 Launcher

if "%USACO_IDE_PORT%"=="" (set "PORT=5050") else (set "PORT=%USACO_IDE_PORT%")
set "URL=http://127.0.0.1:%PORT%"

REM Always run relative to this script: launcher\ -> ..\backend
cd /d "%~dp0..\backend"

echo ==================================================
echo    USACO IDE 2.0  -  Launcher
echo ==================================================
echo.

REM ---- 1. Node.js present and recent enough? ----
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Khong tim thay Node.js.
  echo         Hay cai Node.js LTS tu https://nodejs.org roi chay lai.
  echo.
  pause
  exit /b 1
)
for /f "tokens=1 delims=." %%v in ('node -v') do set "NODE_MAJOR=%%v"
set "NODE_MAJOR=%NODE_MAJOR:v=%"
if %NODE_MAJOR% LSS 18 (
  echo [ERROR] Node.js qua cu ^(can ^>= 18, dang co: %NODE_MAJOR%^).
  echo         Cap nhat Node.js LTS tai https://nodejs.org roi chay lai.
  echo.
  pause
  exit /b 1
)

REM ---- 2. Is OUR backend already on this port? just open the browser ----
curl -s "%URL%/api/health" 2>nul | find "USACO IDE" >nul
if !errorlevel! == 0 (
  echo [OK]    Backend da chay san tren cong %PORT%. Chi mo trinh duyet.
  start "" "%URL%"
  exit /b 0
)

REM ---- 3. Port busy with something ELSE? bail out with a clear message ----
netstat -ano | findstr /r /c:":%PORT% .*LISTENING" >nul
if !errorlevel! == 0 (
  echo [ERROR] Cong %PORT% dang bi mot ung dung KHAC chiem dung.
  echo         Cach 1: tat ung dung dang giu cong %PORT%.
  echo         Cach 2: doi cong roi chay lai, vi du:
  echo                 set USACO_IDE_PORT=5051 ^&^& "%~f0"
  echo.
  pause
  exit /b 1
)

REM ---- 4. First run -> install dependencies ----
if not exist "node_modules" (
  echo [SETUP] Cai dependencies lan dau ^(npm install^)...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install that bai. Kiem tra ket noi mang roi chay lai.
    echo.
    pause
    exit /b 1
  )
)

REM ---- 5. Start the backend in its own window ----
echo [START] Khoi dong backend USACO IDE 2.0 tren cong %PORT% ...
start "USACO IDE 2.0 backend" cmd /k node server.js

REM ---- 6. Wait until the server answers, then open the default browser ----
echo [WAIT]  Cho backend san sang...
for /l %%i in (1,1,40) do (
  curl -s -o nul "%URL%/api/health" 2>nul
  if !errorlevel! == 0 goto :ready
  timeout /t 1 /nobreak >nul
)
echo [ERROR] Backend khong phan hoi sau 40 giay.
echo         Xem loi trong cua so "USACO IDE 2.0 backend" vua mo.
echo.
pause
exit /b 1

:ready
echo [OPEN]  Mo trinh duyet: %URL%
start "" "%URL%"
echo.
echo Backend dang chay o cua so rieng. Dong cua so do de tat server.
exit /b 0
