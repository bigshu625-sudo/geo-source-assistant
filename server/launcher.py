"""Local service lifecycle shared by the Windows and macOS launch scripts."""
from __future__ import annotations

import argparse
import importlib
import json
import os
from pathlib import Path
import platform
import signal
import socket
import subprocess
import sys
import time
from urllib.error import URLError
from urllib.request import ProxyHandler, build_opener

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'server' / 'app.py'
DATA = Path(os.environ.get('AI_SOURCE_DATA', ROOT / 'data')).resolve()
PORT = int(os.environ.get('AI_SOURCE_PORT', '18765'))
MANIFEST = json.loads((ROOT / 'extension' / 'manifest.json').read_text(encoding='utf-8'))
NAME = MANIFEST['name']
VERSION = MANIFEST['version']
HTTP = build_opener(ProxyHandler({}))


def health():
    try:
        with HTTP.open(f'http://127.0.0.1:{PORT}/health', timeout=1) as response:
            result = json.load(response)
        return result if isinstance(result, dict) else None
    except (OSError, URLError, ValueError):
        return None


def saved_pid():
    try:
        value = int((DATA / 'service-pid.txt').read_text(encoding='utf-8').strip())
        return value if value > 0 else None
    except (OSError, ValueError):
        return None


def process_command(pid):
    if not pid:
        return ''
    if os.name == 'nt':
        command = ['powershell.exe', '-NoProfile', '-Command',
                   f'$p = Get-CimInstance Win32_Process -Filter "ProcessId = {int(pid)}"; '
                   'if ($p) { [Console]::OutputEncoding = [Text.UTF8Encoding]::new(); '
                   '[Console]::Write($p.CommandLine) }']
    else:
        command = ['ps', '-ww', '-p', str(pid), '-o', 'command=']
    result = subprocess.run(command, capture_output=True, timeout=10,
                            creationflags=0x08000000 if os.name == 'nt' else 0)
    return result.stdout.decode('utf-8', errors='replace').strip() if result.returncode == 0 else ''


def owns_process(pid):
    command = process_command(pid)
    # Both launch paths pass the absolute script path as one subprocess argument.
    return bool(command and str(APP) in command)


def open_token():
    token = DATA / 'pairing-token.txt'
    if not token.exists():
        raise RuntimeError('连接码文件尚未生成，请查看服务日志。')
    if os.name == 'nt':
        os.startfile(str(token))
    elif sys.platform == 'darwin':
        subprocess.run(['open', '-t', str(token)], check=True)
    print(f'请把连接码文件中的内容粘贴到插件设置：{token}')


def start(show_token=True):
    DATA.mkdir(parents=True, exist_ok=True)
    existing = health()
    if existing:
        if not owns_process(saved_pid()):
            raise RuntimeError(f'端口 {PORT} 已被其他目录的服务占用，请先停止原服务。')
        if existing.get('version') != VERSION or 'question-answer' not in existing.get('captureScopes', []):
            raise RuntimeError('当前运行的是旧版服务，请先运行“重启服务”。')
        print(f'本目录的 V{VERSION} 服务已在运行。')
    else:
        with socket.socket() as probe:
            if probe.connect_ex(('127.0.0.1', PORT)) == 0:
                raise RuntimeError(f'端口 {PORT} 已被其他程序占用，未启动新服务。')
        if owns_process(saved_pid()):
            raise RuntimeError('本目录服务进程仍在运行但尚未响应，请稍后重试或运行“重启服务”。')
        environment = {**os.environ, 'PYTHONUTF8': '1', 'PYTHONIOENCODING': 'utf-8',
                       'AI_SOURCE_DATA': str(DATA), 'AI_SOURCE_PORT': str(PORT)}
        with (DATA / 'service.log').open('ab') as output, (DATA / 'service-error.log').open('ab') as errors:
            child = subprocess.Popen([sys.executable, '-u', str(APP)], cwd=ROOT, env=environment,
                                     stdin=subprocess.DEVNULL, stdout=output, stderr=errors,
                                     start_new_session=os.name != 'nt',
                                     creationflags=0x08000000 if os.name == 'nt' else 0)
        for _ in range(75):
            result = health()
            # Windows virtualenv python.exe can be a redirector process, whose
            # Popen PID differs from the Python process that runs app.py.
            if result and result.get('version') == VERSION and owns_process(saved_pid()):
                break
            if child.poll() is not None:
                raise RuntimeError(f'服务启动失败，请查看：{DATA / "service-error.log"}')
            time.sleep(0.2)
        else:
            raise RuntimeError(f'服务未及时响应，请查看：{DATA / "service-error.log"}，再运行“重启服务”。')
        print(f'{NAME} V{VERSION} 已启动：http://127.0.0.1:{PORT}')
    print(f'资料目录：{DATA}')
    if show_token:
        open_token()


def stop():
    pid = saved_pid()
    if not pid:
        if health():
            raise RuntimeError('检测到其他目录的服务，请从它的目录运行停止脚本。')
        print('本目录服务未运行。')
        return
    command = process_command(pid)
    if command and str(APP) not in command:
        raise RuntimeError('记录的进程属于其他程序，已拒绝停止。')
    if command:
        os.kill(pid, signal.SIGTERM)
        for _ in range(40):
            time.sleep(0.2)
            if not process_command(pid):
                break
        else:
            raise RuntimeError('服务尚未停止，请查看系统进程和服务日志。')
    pid_file = DATA / 'service-pid.txt'
    if saved_pid() == pid:
        pid_file.unlink(missing_ok=True)
    print('本目录服务已停止，任务和截图保留。')


def check():
    for module in ('requests', 'openpyxl', 'PIL', 'imageio_ffmpeg'):
        importlib.import_module(module)
    from imageio_ffmpeg import get_ffmpeg_exe
    executable = os.environ.get('AI_SOURCE_FFMPEG') or get_ffmpeg_exe()
    subprocess.run([executable, '-version'], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
                   check=True, timeout=15, creationflags=0x08000000 if os.name == 'nt' else 0)
    print(f'依赖检查通过：{platform.system()} {platform.machine()} / Python {platform.python_version()}')
    print(f'{NAME} V{VERSION}；FFmpeg 可运行。')


def main():
    parser = argparse.ArgumentParser(description=f'{NAME}本机服务管理')
    parser.add_argument('action', choices=['start', 'stop', 'restart', 'status', 'check'])
    parser.add_argument('--no-open', action='store_true', help='不打开连接码文件')
    arguments = parser.parse_args()
    try:
        if arguments.action == 'check':
            check()
        elif arguments.action == 'stop':
            stop()
        elif arguments.action == 'status':
            result = health()
            owned = owns_process(saved_pid())
            print(json.dumps({'running': bool(result and owned), 'version': (result or {}).get('version'),
                              'directory': str(ROOT), 'data': str(DATA), 'port': PORT}, ensure_ascii=False))
            return 0 if result and owned else 1
        else:
            if arguments.action == 'restart':
                stop()
            start(show_token=not arguments.no_open)
        return 0
    except (OSError, RuntimeError, subprocess.SubprocessError, ImportError) as error:
        print(f'操作失败：{error}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
