# LimonPOS - SSH Key ile Deploy (GitHub + Hetzner)
# Gereksinim: SSH key ~/.ssh/id_rsa veya id_ed25519, GitHub ve Hetzner'e eklenmiş olmalı

param(
    [switch]$SkipCommit,   # Commit yapma, sadece push + deploy
    [switch]$BackendOnly   # Sadece backend container'ı rebuild et
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

# Ayarlar
$GITHUB_REPO = "git@github.com:boramrl-25/LimonPOS.git"
$HETZNER_HOST = "root@77.42.70.162"
$HETZNER_PATH = "/root/LimonPOS"

Write-Host "`n=== LimonPOS SSH Deploy ===" -ForegroundColor Cyan
Write-Host "GitHub: $GITHUB_REPO" -ForegroundColor Gray
Write-Host "Hetzner: $HETZNER_HOST`:$HETZNER_PATH`n" -ForegroundColor Gray

# 1. Git durumu ve opsiyonel commit
$status = git status --porcelain
if ($status -and -not $SkipCommit) {
    Write-Host "[1/4] Degisiklikler commit ediliyor..." -ForegroundColor Yellow
    git add -A
    $msg = Read-Host "Commit mesaji (Enter: deploy)"
    if (-not $msg) { $msg = "deploy" }
    git commit -m $msg
} else {
    Write-Host "[1/4] Commit atlandi (degisiklik yok veya -SkipCommit)" -ForegroundColor Gray
}

# 2. GitHub remote SSH kontrolu
$remote = git remote get-url origin 2>$null
if ($remote -notmatch "^git@github\.com:") {
    Write-Host "[2/4] Git remote SSH'ye cevriliyor..." -ForegroundColor Yellow
    git remote set-url origin $GITHUB_REPO
    Write-Host "  origin -> $GITHUB_REPO" -ForegroundColor Green
}

# 3. GitHub'a push (SSH key kullanir)
Write-Host "`n[3/4] GitHub'a push (SSH)..." -ForegroundColor Cyan
git push -u origin main 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "GitHub push HATASI. SSH key tanimli mi? github.com'da Deploy Key veya hesabinda SSH key ekli mi?" -ForegroundColor Red
    Write-Host "Kontrol: ssh -T git@github.com" -ForegroundColor Yellow
    exit 1
}
Write-Host "  GitHub push OK" -ForegroundColor Green

# 4. Hetzner'da deploy (SSH key kullanir)
Write-Host "`n[4/4] Hetzner sunucuya deploy (SSH)..." -ForegroundColor Cyan
$deployCmd = "cd $HETZNER_PATH && git fetch origin && git reset --hard origin/main"
if ($BackendOnly) {
    $deployCmd += " && docker compose up -d --build backend"
} else {
    $deployCmd += " && docker compose up -d --build"
}
ssh -o StrictHostKeyChecking=no $HETZNER_HOST $deployCmd
if ($LASTEXITCODE -ne 0) {
    Write-Host "Hetzner deploy HATASI. SSH key sunucuya eklenmis mi? (ssh-copy-id $HETZNER_HOST)" -ForegroundColor Red
    exit 1
}
Write-Host "  Hetzner deploy OK" -ForegroundColor Green

Write-Host "`n=== Deploy tamamlandi ===" -ForegroundColor Green
Write-Host "API:  https://api.the-limon.com/api/health" -ForegroundColor Gray
Write-Host "Web:  https://pos.the-limon.com`n" -ForegroundColor Gray
