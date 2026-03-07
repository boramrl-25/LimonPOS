# Railway Deploy - LimonPOS Backend + Backoffice
# Ilk kez: Terminalde "railway login" calistirip giris yapin.
# Sonra: .\deploy-railway.ps1

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host "Railway durumu kontrol ediliyor..." -ForegroundColor Cyan
railway whoami 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "HATA: Railway'e giris yapilmamis. Once su komutu calistirin: railway login" -ForegroundColor Red
    exit 1
}

# Backend deploy
Write-Host "`n[1/2] Backend (API) deploy ediliyor..." -ForegroundColor Cyan
Set-Location $root\backend
railway up --detach
if ($LASTEXITCODE -ne 0) {
    Write-Host "Backend deploy basarisiz." -ForegroundColor Red
    Set-Location $root
    exit 1
}
Write-Host "Backend deploy tetiklendi." -ForegroundColor Green

# Backoffice deploy (ayri servis - once link gerekebilir)
Write-Host "`n[2/2] Backoffice (Web) deploy ediliyor..." -ForegroundColor Cyan
Set-Location $root\pos-backoffice
railway up --detach
if ($LASTEXITCODE -ne 0) {
    Write-Host "Backoffice deploy tetiklenemedi (servis bagli olmayabilir - Railway dashboard'dan pos-backoffice servisini secip 'railway link' yapin)." -ForegroundColor Yellow
} else {
    Write-Host "Backoffice deploy tetiklendi." -ForegroundColor Green
}

Set-Location $root
Write-Host "`nBitti. Railway dashboard'dan build durumunu takip edebilirsiniz." -ForegroundColor Green
