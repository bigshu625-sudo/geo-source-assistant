#!/bin/bash
# Sourced by the macOS Finder/Terminal entry points. Compatible with macOS Bash 3.2.
set -Eeuo pipefail
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"
export PYTHONUTF8=1 PYTHONIOENCODING=utf-8

on_error() {
    local code=$?
    echo
    echo "操作未完成，请保留上方错误信息。安装说明：$PROJECT_DIR/安装说明.html"
    if [ -t 0 ]; then read -r -p "按回车关闭窗口…" || true; fi
    exit "$code"
}
trap on_error ERR

finish() {
    if [ -t 0 ]; then read -r -p "按回车关闭窗口；已启动的本机服务会继续运行…" || true; fi
}

require_python() {
    PYTHON_EXE="$PROJECT_DIR/.venv/bin/python"
    if [ ! -x "$PYTHON_EXE" ]; then
        echo '尚未安装 Mac 依赖，请先运行“安装依赖.command”。'
        return 1
    fi
}

find_uv() {
    if command -v uv >/dev/null 2>&1; then UV_EXE="$(command -v uv)";
    elif [ -x "$HOME/.local/bin/uv" ]; then UV_EXE="$HOME/.local/bin/uv";
    elif [ -x "/opt/homebrew/bin/uv" ]; then UV_EXE="/opt/homebrew/bin/uv";
    elif [ -x "/usr/local/bin/uv" ]; then UV_EXE="/usr/local/bin/uv";
    else
        echo '首次安装：从 astral.sh 官方安装用户级 uv，不修改 shell 配置。'
        local installer
        installer="$(mktemp "${TMPDIR:-/tmp}/ai-source-uv.XXXXXX")"
        if ! curl --fail --location --proto '=https' --tlsv1.2 https://astral.sh/uv/install.sh --output "$installer"; then
            rm -f -- "$installer"
            echo 'uv 下载失败，请检查联网后重试：https://docs.astral.sh/uv/getting-started/installation/'
            return 1
        fi
        if ! UV_INSTALL_DIR="$HOME/.local/bin" UV_NO_MODIFY_PATH=1 sh "$installer"; then
            rm -f -- "$installer"
            return 1
        fi
        rm -f -- "$installer"
        UV_EXE="$HOME/.local/bin/uv"
    fi
}
