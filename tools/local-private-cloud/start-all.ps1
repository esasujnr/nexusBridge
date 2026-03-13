$ErrorActionPreference = "Stop"

& (Join-Path $PSScriptRoot "start-auth.ps1") -Background
Start-Sleep -Seconds 2
& (Join-Path $PSScriptRoot "start-comm.ps1") -Background
Start-Sleep -Seconds 1
& (Join-Path $PSScriptRoot "status.ps1")
