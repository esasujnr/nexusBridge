param(
    [string]$LanIp = "",
    [switch]$RestoreCloud
)

$ErrorActionPreference = "Stop"

function Resolve-LanIp {
    param([string]$Preferred)
    if (-not [string]::IsNullOrWhiteSpace($Preferred)) {
        return $Preferred
    }
    $candidate = Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
        $_.IPAddress -notlike "127.*" -and
        $_.IPAddress -notlike "169.254*" -and
        $_.InterfaceAlias -notlike "Tailscale*"
    } | Where-Object { $_.InterfaceAlias -in @("Wi-Fi", "Ethernet") } | Select-Object -First 1
    if (-not $candidate) {
        throw "Unable to auto-detect LAN IP. Pass -LanIp manually."
    }
    return $candidate.IPAddress
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$configPath = Join-Path $repoRoot "public\config.json"
$backupPath = Join-Path $repoRoot "public\config.cloud.backup.json"

if (-not (Test-Path $configPath)) {
    throw "Missing $configPath"
}

if ($RestoreCloud) {
    if (-not (Test-Path $backupPath)) {
        throw "Backup not found at $backupPath"
    }
    Copy-Item $backupPath $configPath -Force
    Write-Host "Restored cloud config."
    return
}

if (-not (Test-Path $backupPath)) {
    Copy-Item $configPath $backupPath -Force
}

$resolvedLanIp = Resolve-LanIp -Preferred $LanIp
$content = Get-Content -Path $configPath -Raw

$content = [regex]::Replace($content, '"CONST_TEST_MODE"\s*:\s*(true|false)', '"CONST_TEST_MODE": false')
$content = [regex]::Replace($content, '"CONST_PROD_MODE_IP"\s*:\s*"[^"]*"', ('"CONST_PROD_MODE_IP": "' + $resolvedLanIp + '"'))
$content = [regex]::Replace($content, '"CONST_PROD_MODE_PORT"\s*:\s*"[^"]*"', '"CONST_PROD_MODE_PORT": "19408"')
$content = [regex]::Replace($content, '"CONST_WEBCONNECTOR_ENABLED"\s*:\s*(true|false)', '"CONST_WEBCONNECTOR_ENABLED": false')

Set-Content -Path $configPath -Value $content -Encoding UTF8
Write-Host "Nexus Bridge config switched to private auth at $resolvedLanIp:19408"
