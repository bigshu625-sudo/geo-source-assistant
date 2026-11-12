@echo off
chcp 65001 >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0停止服务.ps1"
if errorlevel 1 goto error
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0启动服务.ps1"
exit /b 0
:error
echo 无法安全停止服务，请查看错误信息。
pause
exit /b 1
