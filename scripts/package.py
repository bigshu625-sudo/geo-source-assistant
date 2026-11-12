"""Build runtime and GitHub source archives from public program files."""
from datetime import datetime
import hashlib
import json
from pathlib import Path
import stat
import zipfile

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = json.loads((ROOT / 'extension/manifest.json').read_text(encoding='utf-8'))
VERSION = MANIFEST['version']
REVISION = 'cross-platform-r2'
TOP = f'{MANIFEST["name"]}-V{VERSION}'
OUTPUT = ROOT / 'release'


def file_bytes(path):
    content = path.read_bytes()
    if path.suffix in ('.command', '.sh', '.ps1', '.cmd'):
        text = content.decode('utf-8-sig').replace('\r\n', '\n').replace('\r', '\n')
        if path.suffix in ('.cmd', '.ps1'):
            text = text.replace('\n', '\r\n')
        content = text.encode('utf-8-sig' if path.suffix == '.ps1' else 'utf-8')
    return content


def write_entry(archive, name, content):
    entry = zipfile.ZipInfo(name, datetime.now().timetuple()[:6])
    entry.create_system = 3
    permissions = 0o755 if Path(name).suffix in ('.command', '.sh') else 0o644
    entry.external_attr = (stat.S_IFREG | permissions) << 16
    entry.compress_type = zipfile.ZIP_DEFLATED
    archive.writestr(entry, content)


def build_archive(destination, files, prefix=''):
    hashes = {}
    with zipfile.ZipFile(destination, 'w') as archive:
        for relative, path in sorted(files.items()):
            content = file_bytes(path)
            hashes[relative] = hashlib.sha256(content).hexdigest()
            write_entry(archive, prefix + relative, content)
        release = {'applicationName': MANIFEST['name'], 'applicationVersion': VERSION, 'distributionRevision': REVISION,
                   'builtAt': datetime.now().astimezone().isoformat(timespec='seconds'),
                   'targets': ['Windows x64', 'macOS Apple Silicon', 'macOS Intel'],
                   'python': '3.12', 'macRealMachineTest': 'pending',
                   'includesLocalData': False, 'filesSHA256': hashes}
        write_entry(archive, prefix + '版本信息.json', json.dumps(release, ensure_ascii=False, indent=2).encode('utf-8'))
    with zipfile.ZipFile(destination) as archive:
        if archive.testzip():
            raise RuntimeError('ZIP 校验失败')
        for relative, digest in hashes.items():
            assert hashlib.sha256(archive.read(prefix + relative)).hexdigest() == digest
    return {'filename': destination.name, 'bytes': destination.stat().st_size,
            'sha256': hashlib.sha256(destination.read_bytes()).hexdigest(), 'files': len(hashes)}


def main():
    OUTPUT.mkdir(exist_ok=True)
    extension = {p.relative_to(ROOT / 'extension').as_posix(): p
                 for p in (ROOT / 'extension').rglob('*') if p.is_file() and not p.is_symlink()}
    license_file = ROOT / 'LICENSE'
    runtime = {'extension/' + name: path for name, path in extension.items()}
    runtime['LICENSE'] = license_file
    # Runtime allowlist excludes data, credentials, diagnostics and development tools.
    for name in ['server/app.py', 'server/launcher.py', 'server/export_folder.py',
                 'server/requirements.txt', 'server/requirements-lock.txt',
                 'scripts/mac-common.sh', 'scripts/install.ps1',
                 'README.md', '安装说明.html', 'docs/跨平台安装与Mac测试.md',
                 'docs/ARCHITECTURE.md']:
        runtime[name] = ROOT / name
    for path in ROOT.iterdir():
        if path.is_file() and path.suffix in ('.cmd', '.ps1', '.command') and path.stem not in ('安装本地转写', '下载本地模型'):
            runtime[path.name] = path
    # Keep local investigation scripts, browser fixtures and historical acceptance records out of GitHub.
    source = runtime.copy()
    for name in ['.gitignore', 'package.json', 'scripts/check.mjs', 'scripts/package.py',
                 'tests/core.test.mjs', 'tests/capture-lock.test.mjs', 'tests/capture-visible.test.mjs',
                 'tests/server_test.py', 'tests/release_test.py']:
        source[name] = ROOT / name
    results = [
        build_archive(OUTPUT / f'{TOP}-Chrome插件.zip', {**extension, 'LICENSE': license_file}),
        build_archive(OUTPUT / f'{TOP}-跨平台运行包.zip', runtime, TOP + '/'),
        build_archive(OUTPUT / f'{TOP}-GitHub源码.zip', source),
    ]
    (OUTPUT / 'SHA256SUMS.txt').write_text(''.join(f'{x["sha256"]}  {x["filename"]}\n' for x in results), encoding='utf-8')
    print(json.dumps({'version': VERSION, 'revision': REVISION, 'archives': results}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()

