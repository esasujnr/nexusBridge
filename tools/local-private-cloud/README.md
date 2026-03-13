# Local Private DroneEngage Cloud (Auth + Comm)

This toolkit runs both services on this laptop so drone + Nexus Bridge can use your private stack instead of public cloud.

## Repos used
- `_external/droneegnage_authenticator`
- `_external/droneengage_server`

## 1) Bootstrap (one-time or when LAN IP changes)
```powershell
cd C:\Users\DELL\nexusBridge\tools\local-private-cloud
.\bootstrap.ps1 -LanIp 192.168.1.211
```

What bootstrap does:
- installs npm dependencies for both server repos
- generates TLS cert/key for LAN IP + localhost
- copies certs into both repos (`ssl/domain.key`, `ssl/domain.crt`)
- writes:
  - `_external/droneegnage_authenticator/server.local.config`
  - `_external/droneengage_server/server.local.config`
- trusts cert in current-user Root store (default behavior)

Default local auth credentials (single-account mode):
- user: `single@airgap.droneengage.com`
- access code: `test`

## 2) Start private stack
```powershell
.\start-all.ps1
```

Expected listeners:
- `19408` auth HTTPS
- `19001` auth S2S WSS
- `9966` comm WSS

Check status anytime:
```powershell
.\status.ps1
```

Stop all:
```powershell
.\stop-all.ps1
```

## 3) Point Nexus Bridge to private auth
```powershell
.\switch-nexus-to-private.ps1 -LanIp 192.168.1.211
```

Restore cloud config:
```powershell
.\switch-nexus-to-private.ps1 -RestoreCloud
```

## 4) Point drone communicator to private auth
On drone `de_comm.config.module.json`, set:
- `auth_ip` = laptop LAN IP
- `auth_port` = `19408`
- `auth_verify_ssl` = `false`
- `ignore_original_comm_server` = `false`

Helper:
```powershell
.\print-drone-config-snippet.ps1 -LanIp 192.168.1.211
```

Then restart drone communicator service/module on the drone.

## 5) Windows firewall
Allow inbound TCP on:
- `19408`
- `9966`

If drone cannot connect, firewall is the first thing to verify.
