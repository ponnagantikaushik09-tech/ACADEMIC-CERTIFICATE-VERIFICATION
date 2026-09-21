@echo off
taskkill /FI "WINDOWTITLE eq LYNKSCERT Backend*" /T /F >nul 2>&1
echo LYNKSCERT backend stopped.
pause
