"""Choose, open and write to a user's export directory on the local computer."""
import filecmp
import os
from pathlib import Path
import shutil
import subprocess
import sys


def existing_folder(value):
    path = Path(value).expanduser()
    if not path.is_absolute() or not path.is_dir():
        raise ValueError('请输入已存在的文件夹完整路径，或点击「选择文件夹」。')
    return path.resolve(strict=True)


def list_folders(value):
    if not isinstance(value, str) or len(value) > 4096:
        raise ValueError('无效的文件夹路径')
    home = Path.home()
    quick = [(label, str(path)) for label, path in (
        ('下载',home/'Downloads'), ('桌面',home/'Desktop'),
        ('文档',home/'Documents'), ('个人文件夹',home),
    ) if path.is_dir()]
    if os.name == 'nt':
        quick.extend((drive, drive) for drive in os.listdrives())
    else:
        quick.append(('系统根目录','/'))
        if sys.platform == 'darwin' and Path('/Volumes').is_dir():
            quick.append(('磁盘和外接设备','/Volumes'))
    try:
        current = existing_folder(value) if value else existing_folder(quick[0][1] if quick else str(home))
        with os.scandir(current) as entries:
            folders = []
            for entry in entries:
                try:
                    if not entry.name.startswith('.') and entry.is_dir():
                        folders.append({'name':entry.name,'path':entry.path})
                except OSError:
                    continue
        folders.sort(key=lambda entry:entry['name'].casefold())
    except OSError as exc:
        raise ValueError('无法读取这个文件夹，请返回上一级或选择其他位置。') from exc
    return {'path':str(current), 'parent':str(current.parent) if current.parent != current else '',
            'folders':folders[:500], 'truncated':len(folders)>500,
            'quick':[{'name':name,'path':path} for name,path in quick]}


def open_folder(path):
    if os.name == 'nt':
        os.startfile(str(path))
    elif sys.platform == 'darwin':
        subprocess.run(['/usr/bin/open', str(path)], check=True, timeout=8, capture_output=True)
    else:
        raise ValueError('当前系统无法自动打开文件管理器，请按显示的路径定位。')


def task_folder(root, name):
    folder = root / name
    folder.mkdir(exist_ok=True)
    if not folder.is_dir() or folder.resolve(strict=True) != folder:
        raise ValueError('导出目录内存在同名链接，请选择其他文件夹。')
    return folder


def save_copy(folder, name, *, data=None, source=None):
    """Keep existing files intact; an identical copy can be reused."""
    base = Path(name)
    if base.name != name or name in ('', '.', '..') or '\\' in name or ':' in name:
        raise ValueError('无效导出文件名')
    for index in range(1, 1000):
        target = folder / (name if index == 1 else f'{base.stem}-{index:02d}{base.suffix}')
        try:
            handle = target.open('xb')
        except FileExistsError:
            if target.is_symlink() or not target.is_file():
                continue
            if (source is not None and filecmp.cmp(source, target, shallow=False)) or (
                data is not None and target.stat().st_size == len(data) and target.read_bytes() == data
            ):
                return target
            continue
        try:
            with handle:
                if source is None:
                    handle.write(data)
                else:
                    with source.open('rb') as original:
                        shutil.copyfileobj(original, handle, 256 * 1024)
        except OSError:
            target.unlink(missing_ok=True)
            raise
        return target
    raise ValueError('同名文件太多，请换一个导出文件夹。')
