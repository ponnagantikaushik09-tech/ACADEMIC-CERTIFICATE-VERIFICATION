@echo off
setlocal EnableExtensions
cd /d "%~dp0"

title LYNKSCERT One-Click Launcher

echo ========================================
echo          LYNKSCERT ONE-CLICK
echo ========================================
echo.

echo Checking Node.js...
where node >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed or not in PATH.
    echo Install Node.js LTS, then run this file again.
    pause
    exit /b 1
)
node --version

echo.
echo Freeing LYNKSCERT port 3000 if needed...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%P >nul 2>&1
)

echo Starting LYNKSCERT backend...
start "LYNKSCERT Backend" /D "%~dp0backend" cmd /k "node server.js"

echo Waiting for backend...
set "READY="
for /L %%N in (1,1,20) do (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3000/api/health' -TimeoutSec 1; if ($r.StatusCode -eq 200 -and $r.Content -match 'LYNKSCERT backend') { exit 0 } } catch {} ; exit 1" >nul 2>&1
    if not errorlevel 1 (
        set "READY=1"
        goto :ready
    )
    timeout /t 1 /nobreak >nul
)

if not defined READY (
    echo.
    echo ERROR: LYNKSCERT backend did not become ready.
    echo Check the LYNKSCERT Backend window for details.
    pause
    exit /b 1
)

:ready
echo Backend ready.
echo Opening LYNKSCERT...
start "" "http://127.0.0.1:3000/"
echo.
echo LYNKSCERT is ready.
echo You can close this launcher window.
echo Keep the Backend window open while using LYNKSCERT.
endlocal
