# .env'i offline (localhost PostgreSQL) moduna cevir
$envPath = Join-Path $PSScriptRoot "..\backend\.env"
$content = Get-Content $envPath -Raw
$content = $content -replace 'DATABASE_URL="postgresql://[^"]*"', 'DATABASE_URL="postgresql://postgres:postgres@localhost:5432/limonpos"'
$content = $content -replace '# Hetzner.*', '# OFFLINE: localhost PostgreSQL'
Set-Content $envPath $content -NoNewline
Write-Host "backend\.env -> OFFLINE (localhost) modu" -ForegroundColor Green
