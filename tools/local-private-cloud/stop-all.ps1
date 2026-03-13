$ErrorActionPreference = "Stop"

$targets = Get-CimInstance Win32_Process | Where-Object {
    $_.Name -ieq "node.exe" -and
    $_.CommandLine -like "*server.local.config*"
}

if (-not $targets) {
    Write-Host "No local auth/comm server processes found."
    return
}

foreach ($proc in $targets) {
    try {
        Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop
        Write-Host "Stopped PID $($proc.ProcessId)"
    } catch {
        Write-Host "Failed to stop PID $($proc.ProcessId): $($_.Exception.Message)"
    }
}
