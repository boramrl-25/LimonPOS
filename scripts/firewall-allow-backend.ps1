# Backend port 3002 - Hotspot'taki tabletlerin baglanmasi icin
# Yonetici olarak calistir: Sag tikla -> Run with PowerShell (Admin)

$ruleName = "LimonPOS Backend 3002"
$port = 3002

# Var mi kontrol et
$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Kural zaten var." -ForegroundColor Yellow
    exit 0
}

New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort $port -Action Allow
Write-Host "Firewall: Port $port acildi. Tabletler backend'e baglanabilir." -ForegroundColor Green
