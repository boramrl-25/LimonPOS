# LimonPOS - Tam Deploy Scripti
# Calistirmak icin: Bu klasorde PowerShell ac -> .\deploy.ps1
# VEYA: powershell -ExecutionPolicy Bypass -NoExit -File ".\deploy.ps1"

$ErrorActionPreference = "Continue"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir = Join-Path $ScriptDir "backend"
$ServerJs   = Join-Path $BackendDir "server.js"
$HetznerHost = "root@77.42.70.162"
$HetznerPath = "~/LimonPOS/backend/server.js"
$SshKey      = "C:\Users\Dell\.ssh\id_ed25519"

function Pause-OnError {
    Write-Host ""
    Read-Host "HATA olustu. Cıkmak icin Enter'a bas"
    exit 1
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  LimonPOS Deploy Script" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# -------------------------------------------------------
# 1. Port 3002 uzerindeki islemi oldur
# -------------------------------------------------------
Write-Host "[1/5] Port 3002 kontrol ediliyor..." -ForegroundColor Yellow
$portInfo = netstat -ano | Select-String ":3002 "
if ($portInfo) {
    $lines = $portInfo | ForEach-Object { $_.Line.Trim() }
    foreach ($line in $lines) {
        $parts = $line -split "\s+"
        $procId = $parts[-1]
        if ($procId -match "^\d+$" -and $procId -ne "0") {
            Write-Host "  -> PID $procId oldüruluyor..." -ForegroundColor Red
            taskkill /PID $procId /F 2>$null | Out-Null
        }
    }
    Start-Sleep -Seconds 2
    Write-Host "  -> Port 3002 serbest birakildi." -ForegroundColor Green
} else {
    Write-Host "  -> Port 3002 zaten bos." -ForegroundColor Green
}

# -------------------------------------------------------
# 2. Prisma generate + db push (schema sync)
# -------------------------------------------------------
Write-Host ""
Write-Host "[2/5] Prisma client yenileniyor..." -ForegroundColor Yellow
Set-Location $BackendDir
$genResult = npx prisma generate --schema="../prisma/schema.prisma" 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  -> Prisma client guncellendi!" -ForegroundColor Green
} else {
    Write-Host "  -> HATA: $genResult" -ForegroundColor Red
    Pause-OnError
}

Write-Host ""
Write-Host "[3/5] Veritabani schema sync ediliyor (db push)..." -ForegroundColor Yellow
$pushResult = npx prisma db push --schema="../prisma/schema.prisma" --accept-data-loss 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  -> DB schema senkronize edildi!" -ForegroundColor Green
} else {
    Write-Host "  -> UYARI: $pushResult" -ForegroundColor Yellow
}

# -------------------------------------------------------
# 3. Hetzner'e dosyalar gonder + rebuild
# -------------------------------------------------------
Write-Host ""
Write-Host "[4/5] Hetzner'e deploy ediliyor (rebuild)..." -ForegroundColor Yellow
$DockerComposeYml = Join-Path $ScriptDir "docker-compose.yml"
$PrismaDir        = Join-Path $ScriptDir "prisma"
$LibDir           = Join-Path $BackendDir "lib"

# Dosyaları gönder
$Dockerfile      = Join-Path $BackendDir "Dockerfile"
$DockerIgnore    = Join-Path $BackendDir ".dockerignore"

scp -i $SshKey -o StrictHostKeyChecking=no "$ServerJs"       "${HetznerHost}:~/LimonPOS/backend/server.js"    2>&1 | Out-Null
scp -i $SshKey -o StrictHostKeyChecking=no "$DockerComposeYml" "${HetznerHost}:~/LimonPOS/docker-compose.yml" 2>&1 | Out-Null
scp -i $SshKey -o StrictHostKeyChecking=no "$Dockerfile"     "${HetznerHost}:~/LimonPOS/backend/Dockerfile"   2>&1 | Out-Null
scp -i $SshKey -o StrictHostKeyChecking=no "$DockerIgnore"   "${HetznerHost}:~/LimonPOS/backend/.dockerignore" 2>&1 | Out-Null
scp -i $SshKey -o StrictHostKeyChecking=no -r "$PrismaDir"   "${HetznerHost}:~/LimonPOS/"                     2>&1 | Out-Null
scp -i $SshKey -o StrictHostKeyChecking=no -r "$LibDir"      "${HetznerHost}:~/LimonPOS/backend/"             2>&1 | Out-Null
Write-Host "  -> Tum dosyalar gonderildi!" -ForegroundColor Green

if ($LASTEXITCODE -eq 0) {
    Write-Host "  -> Dosyalar gonderildi!" -ForegroundColor Green
    Write-Host "  -> Hetzner image yeniden build ediliyor (1-2 dk surebilir)..." -ForegroundColor Yellow
    $sshResult = ssh -i $SshKey -o StrictHostKeyChecking=no $HetznerHost @"
cd ~/LimonPOS && docker compose up -d --build backend frontend
"@ 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  -> Hetzner deploy tamamlandi!" -ForegroundColor Green
    } else {
        Write-Host "  -> Hetzner build HATA: $sshResult" -ForegroundColor Red
    }
} else {
    Write-Host "  -> SCP HATA - Hetzner adimi atlaniyor, local devam ediyor..." -ForegroundColor Yellow
}

# -------------------------------------------------------
# 4. Local backend yeni pencerede baslat
# -------------------------------------------------------
Write-Host ""
Write-Host "[5/6] Local backend baslatiliyor (yeni pencere)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$BackendDir'; Write-Host 'Local backend basliyor...' -ForegroundColor Cyan; npm start"
Write-Host "  -> Local backend yeni pencerede acildi!" -ForegroundColor Green

# -------------------------------------------------------
# 5. Local backoffice (Next.js) yeni pencerede baslat
# -------------------------------------------------------
$BackofficeDir = Join-Path $ScriptDir "pos-backoffice"
Write-Host ""
Write-Host "[6/6] Local backoffice baslatiliyor (yeni pencere)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$BackofficeDir'; Write-Host 'Local backoffice basliyor...' -ForegroundColor Cyan; npm run dev"
Write-Host "  -> Local backoffice yeni pencerede acildi!" -ForegroundColor Green

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  TAMAMLANDI!" -ForegroundColor Green
Write-Host "  Local backend   : http://localhost:3002" -ForegroundColor White
Write-Host "  Local backoffice: http://localhost:3001/pos" -ForegroundColor White
Write-Host "  Hetzner         : https://pos.the-limon.com/pos" -ForegroundColor White
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
Read-Host "Cıkmak icin Enter'a bas"
