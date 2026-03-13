param(
    [Parameter(Mandatory = $true)]
    [string]$LanIp
)

$snippet = @"
{
  "auth_ip": "$LanIp",
  "auth_port": 19408,
  "auth_verify_ssl": false,
  "ignore_original_comm_server": false
}
"@

Write-Host "Apply these fields in de_comm.config.module.json on the drone:"
Write-Host $snippet
