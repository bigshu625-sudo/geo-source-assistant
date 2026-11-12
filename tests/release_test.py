"""Verify the delivered archive and a fresh, isolated Windows installation."""
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import unittest
from urllib.request import ProxyHandler, Request, build_opener
import zipfile

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = json.loads((ROOT / 'extension/manifest.json').read_text(encoding='utf-8'))
TOP = f'{MANIFEST["name"]}-V{MANIFEST["version"]}'
ARCHIVE = ROOT / 'release' / f'{TOP}-跨平台运行包.zip'
HTTP = build_opener(ProxyHandler({}))


class ReleaseTests(unittest.TestCase):
    def test_archive_hashes_permissions_and_no_personal_data(self):
        for suffix in ('Chrome插件', '跨平台运行包', 'GitHub源码'):
            with zipfile.ZipFile(ROOT / 'release' / f'{TOP}-{suffix}.zip') as archive:
                prefix = f'{TOP}/' if suffix == '跨平台运行包' else ''
                release = json.loads(archive.read(prefix + '版本信息.json'))
                self.assertEqual(release['applicationName'], MANIFEST['name'])
                self.assertEqual(release['applicationVersion'], MANIFEST['version'])
                self.assertFalse(release['includesLocalData'])
                self.assertEqual(set(archive.namelist()), {prefix + name for name in (*release['filesSHA256'], '版本信息.json')})
                for relative, digest in release['filesSHA256'].items():
                    content = archive.read(prefix + relative)
                    self.assertEqual(hashlib.sha256(content).hexdigest(), digest)
                for entry in archive.infolist():
                    self.assertFalse(set(Path(entry.filename).parts) & {'data', '.venv', '.git', 'node_modules', '__pycache__', 'backups', 'diagnostics'})
                    self.assertNotIn('pairing-token', entry.filename)
                    if entry.filename.endswith(('.command', '.sh')):
                        self.assertTrue((entry.external_attr >> 16) & 0o111)
                        self.assertNotIn(b'\r', archive.read(entry))
                        self.assertTrue(archive.read(entry).startswith(b'#!/bin/bash\n'))
                    if entry.filename.endswith('.ps1'):
                        self.assertTrue(archive.read(entry).startswith(b'\xef\xbb\xbf'))

    @unittest.skipUnless(os.name == 'nt', 'Fresh Windows installer smoke test')
    def test_fresh_install_lifecycle_ownership_and_exports(self):
        with tempfile.TemporaryDirectory(prefix='ai-source-中文 空格-') as temporary:
            destination = Path(temporary)
            with zipfile.ZipFile(ARCHIVE) as archive:
                archive.extractall(destination)
            project = destination / TOP
            environment = {**os.environ, 'PYTHONUTF8': '1', 'PYTHONIOENCODING': 'utf-8'}
            installed = subprocess.run(['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass',
                                        '-File', str(project / 'scripts/install.ps1')], cwd=project,
                                       env=environment, capture_output=True, text=True, encoding='utf-8', timeout=120)
            self.assertEqual(installed.returncode, 0, installed.stdout + installed.stderr)
            python = project / '.venv/Scripts/python.exe'
            with socket.socket() as reservation:
                reservation.bind(('127.0.0.1', 0))
                port = reservation.getsockname()[1]
            data = project / 'data'
            environment.update(AI_SOURCE_PORT=str(port), AI_SOURCE_DATA=str(data))
            launcher = project / 'server/launcher.py'

            def command(action, success=True, env=environment):
                result = subprocess.run([str(python), str(launcher), action, '--no-open'],
                                        cwd=project, env=env, capture_output=True, text=True,
                                        encoding='utf-8', timeout=40)
                self.assertEqual(result.returncode, 0 if success else 1, result.stdout + result.stderr)
                return result

            token = ''

            def api(path, payload=None):
                body = json.dumps(payload).encode('utf-8') if payload is not None else None
                request = Request(f'http://127.0.0.1:{port}{path}', data=body,
                                  headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
                return HTTP.open(request, timeout=15).read()

            try:
                command('start')
                first_pid = (data / 'service-pid.txt').read_text()
                token = (data / 'pairing-token.txt').read_text().strip()
                command('start')
                self.assertEqual((data / 'service-pid.txt').read_text(), first_pid)
                self.assertTrue(json.loads(command('status').stdout)['running'])
                task = json.loads(api('/tasks', {'keyword': '跨平台中文导出测试',
                                                'origin': 'https://www.doubao.com/chat/test',
                                                'answer': '跨平台测试回答', 'sources': [
                                                    {'url': 'https://example.com/reference', 'title': '示例文章'}]}))
                markdown = api(f'/tasks/{task["id"]}/md').decode('utf-8')
                self.assertIn('跨平台中文导出测试', markdown)
                from openpyxl import load_workbook
                book = load_workbook(io.BytesIO(api(f'/tasks/{task["id"]}/xlsx')))
                self.assertIn('搜索回答', book.sheetnames)
                # A different data directory must not attach to or stop this server.
                other_environment = {**environment, 'AI_SOURCE_DATA': str(destination / 'second-data')}
                command('start', success=False, env=other_environment)
                command('restart')
                self.assertNotEqual((data / 'service-pid.txt').read_text(), first_pid)
                self.assertEqual((data / 'pairing-token.txt').read_text().strip(), token)
                self.assertEqual(json.loads(api(f'/tasks/{task["id"]}'))['keyword'], '跨平台中文导出测试')
                # A reused PID belonging to this test runner must be refused.
                real_pid = (data / 'service-pid.txt').read_text()
                (data / 'service-pid.txt').write_text(str(os.getpid()))
                try:
                    command('stop', success=False)
                finally:
                    (data / 'service-pid.txt').write_text(real_pid)
            finally:
                command('stop')
            command('status', success=False)
            self.assertTrue((data / 'tasks' / task['id'] / 'task.json').exists())


if __name__ == '__main__':
    unittest.main()
