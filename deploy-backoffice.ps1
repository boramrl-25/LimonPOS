Param(
    [string]$ServerUser = "root",
    [string]$ServerHost = "77.42.70.162",
    [string]$KeyPath    = "$env:USERPROFILE\.ssh\id_ed25519",
    [string]$RemoteDeployScript = "/usr/local/bin/deploy-limon-pos-backoffice.sh"
)

Write-Host "=== Limon POS Backoffice Deploy (SSH) ===" -ForegroundColor Cyan
Write-Host "Server : $ServerUser@$ServerHost"
Write-Host "Key    : $KeyPath"
Write-Host "Remote : $RemoteDeployScript"

if (-not (Test-Path $KeyPath)) {
    Write-Error "SSH key not found at $KeyPath. Generate one with 'ssh-keygen -t ed25519' and add it to the server's authorized_keys."
    exit 1
}

$sshCmd = "ssh -i `"$KeyPath`" $ServerUser@$ServerHost `"bash $RemoteDeployScript`""
Write-Host "Running: $sshCmd" -ForegroundColor Yellow

Invoke-Expression $sshCmd

Write-Host "=== Deploy finished ===" -ForegroundColor Green

