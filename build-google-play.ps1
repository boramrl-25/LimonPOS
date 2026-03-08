# LimonPOS - Google Play için AAB oluştur
# Önce keystore oluşturup keystore.properties dosyasını hazırlayın (bkz. KURULUM.md)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path "keystore.properties")) {
    Write-Host "HATA: keystore.properties bulunamadi!" -ForegroundColor Red
    Write-Host "Once KURULUM.md icindeki 'Google Play icin' bolumunu okuyun." -ForegroundColor Yellow
    exit 1
}

Write-Host "Google Play AAB olusturuluyor..." -ForegroundColor Cyan
.\gradlew bundleRelease

if ($LASTEXITCODE -eq 0) {
    $aabPath = "app\build\outputs\bundle\release\app-release.aab"
    Write-Host ""
    Write-Host "Basarili! AAB dosyasi:" -ForegroundColor Green
    Write-Host "  $aabPath" -ForegroundColor White
    Write-Host ""
    Write-Host "Bu dosyayi Google Play Console'a yukleyin." -ForegroundColor Cyan
} else {
    exit $LASTEXITCODE
}
