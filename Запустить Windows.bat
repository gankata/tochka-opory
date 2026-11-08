@echo off
setlocal
cd /d "%~dp0"
title Tochka Opory
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Start-Windows.ps1" %*
if errorlevel 1 goto failed
endlocal
exit /b 0
:failed
echo.
echo Launch failed. See the error above.
pause
endlocal
exit /b 1
