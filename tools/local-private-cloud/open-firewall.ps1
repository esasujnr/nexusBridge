$ErrorActionPreference = "Stop"

$rules = @(
    @{ Name = "NexusBridge Auth 19408"; Port = 19408 },
    @{ Name = "NexusBridge Comm 9966"; Port = 9966 }
)

foreach ($rule in $rules) {
    $existing = Get-NetFirewallRule -DisplayName $rule.Name -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Host "Firewall rule exists: $($rule.Name)"
        continue
    }
    New-NetFirewallRule `
        -DisplayName $rule.Name `
        -Direction Inbound `
        -Action Allow `
        -Protocol TCP `
        -LocalPort $rule.Port | Out-Null
    Write-Host "Created firewall rule: $($rule.Name)"
}
