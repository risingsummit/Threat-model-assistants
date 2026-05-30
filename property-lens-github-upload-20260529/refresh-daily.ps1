param(
    [string]$Config = ".\config.json"
)

$ErrorActionPreference = "Stop"
$Python = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"

if (-not (Test-Path $Python)) {
    throw "Local environment not found. Follow the setup steps in README.md first."
}
if (-not [System.IO.Path]::IsPathRooted($Config)) {
    $Config = Join-Path $PSScriptRoot $Config
}

& $Python (Join-Path $PSScriptRoot "cli.py") collect --config $Config
& $Python (Join-Path $PSScriptRoot "cli.py") train
