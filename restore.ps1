# LimonPOS - Yeniden kurulum scripti (PowerShell)
# Windows'ta Docker Desktop ile: .\restore.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "=== 1. Container'ları build edip başlatıyorum... ===" -ForegroundColor Cyan
docker compose up -d --build

Write-Host "`n=== 2. Veritabanı hazır olana kadar bekliyorum... ===" -ForegroundColor Cyan
Start-Sleep -Seconds 10

Write-Host "`n=== 3. Prisma schema'yı veritabanına uyguluyorum... ===" -ForegroundColor Cyan
docker compose exec -T api npx prisma db push --schema=prisma/schema.prisma

Write-Host "`n=== 4. Seed çalıştırıyorum (varsa)... ===" -ForegroundColor Cyan
try {
    docker compose exec -T api npx prisma db seed --schema=prisma/schema.prisma 2>$null
} catch {
    Write-Host "(Seed yok - devam ediliyor)" -ForegroundColor Yellow
}

Write-Host "`n=== Tamamlandı! ===" -ForegroundColor Green
docker compose ps
