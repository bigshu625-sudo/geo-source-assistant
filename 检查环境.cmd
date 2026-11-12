@echo off
chcp 65001 >nul
cd /d "%~dp0"
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8
if not exist .venv\Scripts\python.exe goto missing
.venv\Scripts\python.exe server\launcher.py check
.venv\Scripts\python.exe server\launcher.py status
pause
exit /b 0
:missing
echo 请先运行安装依赖.cmd
pause
exit /b 1
