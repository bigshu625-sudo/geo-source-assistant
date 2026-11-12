@echo off
chcp 65001 >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install.ps1"
if errorlevel 1 goto error
echo 安装完成，请运行启动服务.cmd
pause
exit /b 0
:error
echo 安装失败，请查看上方错误信息。
pause
exit /b 1
