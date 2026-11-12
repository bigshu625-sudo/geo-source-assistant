param([switch]$LocalWhisper)
$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
$pythonExe = Join-Path $projectDir '.venv\Scripts\python.exe'
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'
$uvCommand = Get-Command uv -ErrorAction SilentlyContinue
$uvExe = if ($uvCommand) { $uvCommand.Source } else { Join-Path $env:USERPROFILE '.local\bin\uv.exe' }
if (-not (Test-Path -LiteralPath $uvExe)) {
    Write-Output 'Installing uv from astral.sh into the current user directory...'
    $installer = Join-Path ([IO.Path]::GetTempPath()) ('ai-source-uv-' + [Guid]::NewGuid().ToString('N') + '.ps1')
    $oldInstallDir = $env:UV_INSTALL_DIR
    $oldModifyPath = $env:UV_NO_MODIFY_PATH
    try {
        Invoke-WebRequest -UseBasicParsing -Uri 'https://astral.sh/uv/install.ps1' -OutFile $installer
        $env:UV_INSTALL_DIR = Join-Path $env:USERPROFILE '.local\bin'
        $env:UV_NO_MODIFY_PATH = '1'
        & $installer
    } finally {
        $env:UV_INSTALL_DIR = $oldInstallDir
        $env:UV_NO_MODIFY_PATH = $oldModifyPath
        Remove-Item -LiteralPath $installer -ErrorAction SilentlyContinue
    }
    if (-not (Test-Path -LiteralPath $uvExe)) { throw 'uv installation failed. See https://docs.astral.sh/uv/getting-started/installation/' }
}
if (-not (Test-Path -LiteralPath (Join-Path $projectDir '.venv'))) {
    & $uvExe venv --python 3.12 (Join-Path $projectDir '.venv')
    if ($LASTEXITCODE -ne 0) { throw 'Python environment creation failed.' }
}
if (-not (Test-Path -LiteralPath $pythonExe)) { throw 'This .venv is not a Windows environment. Extract a fresh copy of the package and run the installer again.' }
if ($LocalWhisper) {
    & $uvExe pip install --python $pythonExe faster-whisper
} else {
    & $uvExe pip install --python $pythonExe --only-binary :all: -r (Join-Path $projectDir 'server\requirements-lock.txt')
}
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
& $pythonExe (Join-Path $projectDir 'server\launcher.py') check
if ($LASTEXITCODE -ne 0) { throw 'Environment check failed.' }
Write-Output 'Ready. Start the local service and load the extension folder in Chrome.'
