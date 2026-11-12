$ErrorActionPreference = 'Stop'
$pythonExe = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $pythonExe)) { throw 'Local Python environment not found.' }
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'
& $pythonExe (Join-Path $PSScriptRoot 'server\launcher.py') stop
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
