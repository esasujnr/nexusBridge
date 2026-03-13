param(
    [switch]$Background
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$commRepo = Join-Path $repoRoot "_external\droneengage_server"
$configPath = Join-Path $commRepo "server.local.config"

if (-not (Test-Path $configPath)) {
    throw "Missing $configPath. Run .\bootstrap.ps1 first."
}

if ($Background) {
    $cmd = "Set-Location '$commRepo'; node server.js --config=server.local.config"
    Start-Process powershell -ArgumentList "-NoExit", "-Command", $cmd | Out-Null
    Write-Host "Communication server started in a new window."
    return
}

Push-Location $commRepo
node server.js --config=server.local.config
Pop-Location
