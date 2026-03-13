$ErrorActionPreference = "Stop"

$ports = @(19408, 19001, 9966)

foreach ($port in $ports) {
    $conn = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -eq $port } | Select-Object -First 1
    if ($conn) {
        Write-Host ("Port {0}: LISTEN ({1})" -f $port, $conn.LocalAddress)
    } else {
        Write-Host ("Port {0}: not listening" -f $port)
    }
}
