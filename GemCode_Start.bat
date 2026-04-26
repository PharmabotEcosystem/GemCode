@echo off
cd /d "%~dp0"
echo Avvio del sistema GemCode in corso...
powershell -ExecutionPolicy Bypass -File "scripts\start_gemcode_local.ps1"
pause
