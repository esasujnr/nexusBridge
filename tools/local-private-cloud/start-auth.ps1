param(
    [switch]$Background
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$authRepo = Join-Path $repoRoot "_external\droneegnage_authenticator"
$configPath = Join-Path $authRepo "server.local.config"

if (-not (Test-Path $configPath)) {
    throw "Missing $configPath. Run .\bootstrap.ps1 first."
}

if ($Background) {
    $cmd = "Set-Location '$authRepo'; node server.js --config=server.local.config"
    Start-Process powershell -ArgumentList "-NoExit", "-Command", $cmd | Out-Null
    Write-Host "Authenticator started in a new window."
    return
}

Push-Location $authRepo
node server.js --config=server.local.config
Pop-Location
