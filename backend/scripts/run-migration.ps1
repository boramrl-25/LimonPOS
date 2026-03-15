# Hibrit mimari audit kolonları için migration (Windows PowerShell)
# Kullanım: cd backend; .\scripts\run-migration.ps1
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

if (-not $env:DATABASE_URL) {
  if (Test-Path .env) {
    Get-Content .env | ForEach-Object {
      if ($_ -match '^([^#][^=]+)=(.*)$') {
        [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), "Process")
      }
    }
  }
}
if (-not $env:DATABASE_URL) {
  Write-Host "DATABASE_URL gerekli. .env dosyasında veya ortam değişkeni olarak tanımlayın."
  exit 1
}
Write-Host "Running prisma db push..."
npx prisma db push
Write-Host "Migration tamamlandı."
