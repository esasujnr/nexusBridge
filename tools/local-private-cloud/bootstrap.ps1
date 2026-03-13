param(
    [string]$LanIp = "",
    [bool]$TrustCert = $true
)

$ErrorActionPreference = "Stop"

function Resolve-LanIp {
    param([string]$Preferred)
    if (-not [string]::IsNullOrWhiteSpace($Preferred)) {
        return $Preferred
    }

    $all = Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
        $_.IPAddress -notlike "127.*" -and
        $_.IPAddress -notlike "169.254*" -and
        $_.InterfaceAlias -notlike "Tailscale*"
    }

    if (-not $all) {
        throw "Unable to auto-detect LAN IP. Pass -LanIp manually."
    }

    $preferred = $all | Where-Object { $_.InterfaceAlias -in @("Wi-Fi", "Ethernet") } | Select-Object -First 1
    if ($preferred) {
        return $preferred.IPAddress
    }

    return ($all | Select-Object -First 1).IPAddress
}

function Ensure-NpmDeps {
    param([string]$Path)
    if (-not (Test-Path (Join-Path $Path "node_modules"))) {
        Write-Host "Installing npm dependencies in $Path"
        Push-Location $Path
        npm install --no-audit --no-fund | Out-Host
        Pop-Location
    }
}

function Write-AuthConfig {
    param([string]$Path)
    $content = @"
{
    "server_id": "AndruavAuthLocal",
    "server_ip": "0.0.0.0",
    "server_port": 19408,
    "health_utl": "/h",
    "account_storage_type": "single",
    "single_account_user_name": "single@airgap.droneengage.com",
    "single_account_access_code": "test",
    "db_users": "./db_users.local.db",
    "enableLog": true,
    "log_directory": "./logs/",
    "log_timeZone": "GMT",
    "log_detailed": true,
    "ignoreEmail": true,
    "smtp_host": "smtp.email.com",
    "smtp_port": 465,
    "smtp_user": "myemail@mail.com",
    "smtp_password": "password",
    "smtp_ssl": true,
    "s2s_ws_listening_ip": "127.0.0.1",
    "s2s_ws_listening_port": "19001",
    "enable_SSL": true,
    "ssl_key_file": "ssl/domain.key",
    "ssl_cert_file": "ssl/domain.crt",
    "skip_hardware_validation": true,
    "andruavSecurityEx": "Andruav Web Panel, Andruav Geo Fence Manager, DRONE ENGAGE Web Client, Andruav Mobile, uavos",
    "APPVERSION": "{\"andruav\": \"4.00.00\", \"uavos\": \"1.0.0\", \"de\": \"1.0.0\"}"
}
"@
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $content, $utf8NoBom)
}

function Write-CommConfig {
    param(
        [string]$Path,
        [string]$LanIpValue
    )
    $content = @"
{
    "server_id": "AndruavCommLocal",
    "server_ip": "0.0.0.0",
    "public_host": "$LanIpValue",
    "server_sid": 0,
    "server_port": 9966,
    "enable_SSL": true,
    "dbIP": "localhost",
    "dbuser": "DBUSER",
    "dbpassword": "DBPASSWORD",
    "dbdatabase": "andruav",
    "s2s_ws_target_ip": "127.0.0.1",
    "s2s_ws_target_port": "19001",
    "ssl_key_file": "../ssl/domain.key",
    "ssl_cert_file": "../ssl/domain.crt",
    "allow_fake_SSL": true,
    "ca_cert_path": "../ssl/root.crt",
    "ignoreLoadingTasks": true,
    "allow_udpproxy_fixed_port": true,
    "ignoreLog": false,
    "log_directory": "./logs/",
    "log_timeZone": "GMT",
    "log_detailed": true,
    "ws_compression": false,
    "memory_max": 973
}
"@
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $content, $utf8NoBom)
}

$scriptDir = $PSScriptRoot
$repoRoot = Resolve-Path (Join-Path $scriptDir "..\..")
$authRepo = Join-Path $repoRoot "_external\droneegnage_authenticator"
$commRepo = Join-Path $repoRoot "_external\droneengage_server"

if (-not (Test-Path $authRepo)) { throw "Authenticator repo not found at $authRepo" }
if (-not (Test-Path $commRepo)) { throw "Server repo not found at $commRepo" }

$resolvedLanIp = Resolve-LanIp -Preferred $LanIp
Write-Host "Using LAN IP: $resolvedLanIp"

Ensure-NpmDeps -Path $scriptDir
Ensure-NpmDeps -Path $authRepo
Ensure-NpmDeps -Path $commRepo

$certDir = Join-Path $scriptDir ".cert"
node (Join-Path $scriptDir "generate-cert.mjs") --lan-ip $resolvedLanIp --out-dir $certDir | Out-Host

foreach ($repo in @($authRepo, $commRepo)) {
    $sslDir = Join-Path $repo "ssl"
    $logDir = Join-Path $repo "logs"
    New-Item -Path $sslDir -ItemType Directory -Force | Out-Null
    New-Item -Path $logDir -ItemType Directory -Force | Out-Null
    Copy-Item (Join-Path $certDir "domain.key") (Join-Path $sslDir "domain.key") -Force
    Copy-Item (Join-Path $certDir "domain.crt") (Join-Path $sslDir "domain.crt") -Force
    Copy-Item (Join-Path $certDir "domain.crt") (Join-Path $sslDir "root.crt") -Force
}

if ($TrustCert) {
    Write-Host "Trusting certificate in Current User Root store"
    certutil -user -f -addstore Root (Join-Path $certDir "domain.crt") | Out-Null
}

Write-AuthConfig -Path (Join-Path $authRepo "server.local.config")
Write-CommConfig -Path (Join-Path $commRepo "server.local.config") -LanIpValue $resolvedLanIp

Write-Host "Bootstrap complete."
Write-Host "Auth config: $authRepo\server.local.config"
Write-Host "Comm config: $commRepo\server.local.config"
Write-Host "Next: run .\start-all.ps1"
