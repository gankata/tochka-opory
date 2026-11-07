@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title Точка опоры
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Start-Windows.ps1" %*
if errorlevel 1 (
  echo.
  echo Запуск завершился с ошибкой. Сообщение выше поможет найти причину.
  pause
)
endlocal
