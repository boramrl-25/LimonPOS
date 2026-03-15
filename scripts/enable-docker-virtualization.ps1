# Docker icin Sanallastirma - Yonetici olarak calistir
# Sag tikla -> "Run with PowerShell" VEYA PowerShell (Admin) -> .\enable-docker-virtualization.ps1

$ErrorActionPreference = "Stop"
if (-NOT ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "Yonetici olarak calistirin: Sag tikla -> PowerShell'de Yonetici olarak calistir" -ForegroundColor Red
    Write-Host "Sonra: Set-ExecutionPolicy Bypass -Scope Process; .\enable-docker-virtualization.ps1" -ForegroundColor Yellow
    exit 1
}

Write-Host "Virtual Machine Platform ve WSL aktiflestiriliyor..." -ForegroundColor Cyan

# WSL2 icin gerekli
Enable-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform -NoRestart -All
Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux -NoRestart -All

Write-Host ""
Write-Host "Tamam. Simdi BILGISAYARI YENIDEN BASLATIN." -ForegroundColor Green
Write-Host "Yeniden baslattiktan sonra Docker Desktop'i acin." -ForegroundColor Yellow
Write-Host ""
Read-Host "Devam icin Enter'a basin"
