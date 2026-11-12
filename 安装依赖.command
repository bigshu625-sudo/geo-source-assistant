#!/bin/bash
source "$(dirname "$0")/scripts/mac-common.sh"
find_uv
if [ ! -d .venv ]; then
    "$UV_EXE" venv --python 3.12 .venv
fi
require_python
"$UV_EXE" pip install --python "$PYTHON_EXE" --only-binary :all: -r server/requirements-lock.txt
"$PYTHON_EXE" server/launcher.py check
echo '安装完成。下一步运行“启动服务.command”，再在 Chrome 加载 extension 文件夹。'
finish
