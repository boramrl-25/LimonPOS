# Railway (Backend) + Vercel (Backoffice) tek script ile deploy
# Railway: "railway login" VEYA RAILWAY_TOKEN (Project Token: Railway -> Project -> Settings -> Tokens)
# Vercel: vercel link (pos-backoffice)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host "=== Railway (Backend) ===" -ForegroundColor Cyan
if (-not $env:RAILWAY_TOKEN) {
    railway whoami 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Railway giris yok. Ya 'railway login' yapin ya da RAILWAY_TOKEN (Project Token) ortam degiskeni verin." -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "RAILWAY_TOKEN kullaniliyor (etkileşimsiz deploy)." -ForegroundColor Gray
}

Set-Location $root\backend
railway up --detach
if ($LASTEXITCODE -ne 0) {
    Write-Host "Railway deploy hatasi. backend klasorunde 'railway link' yaptiniz mi?" -ForegroundColor Red
    Set-Location $root
    exit 1
}
Write-Host "Backend deploy tetiklendi (Railway)." -ForegroundColor Green

Write-Host "`n=== Vercel (Backoffice) ===" -ForegroundColor Cyan
Set-Location $root\pos-backoffice
$vercelCmd = Get-Command vercel -ErrorAction SilentlyContinue
if (-not $vercelCmd) {
    Write-Host "Vercel CLI yok. Kurmak icin: npm i -g vercel" -ForegroundColor Yellow
    Write-Host "Sonra: cd pos-backoffice && vercel link && vercel --prod" -ForegroundColor Yellow
} else {
    vercel --prod
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Vercel deploy hatasi. Ilk kez: vercel link" -ForegroundColor Yellow
    } else {
        Write-Host "Backoffice deploy tamamlandi (Vercel)." -ForegroundColor Green
    }
}

Set-Location $root
Write-Host "`nBitti. Railway + Vercel dashboard'lardan build durumunu kontrol edin." -ForegroundColor Green
