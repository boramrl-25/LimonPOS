#!/bin/bash
# LimonPOS - Yeniden kurulum scripti (docker compose down -v sonrası)
# Sunucuda çalıştırın: bash restore.sh

set -e
cd "$(dirname "$0")"

echo "=== 1. Container'ları build edip başlatıyorum... ==="
docker compose up -d --build

echo ""
echo "=== 2. Veritabanı hazır olana kadar bekliyorum... ==="
sleep 10

echo ""
echo "=== 3. Prisma schema'yı veritabanına uyguluyorum... ==="
docker compose exec -T api npx prisma db push --schema=prisma/schema.prisma

echo ""
echo "=== 4. Seed çalıştırıyorum (varsa)... ==="
docker compose exec -T api npx prisma db seed --schema=prisma/schema.prisma 2>/dev/null || echo "(Seed yok - devam ediliyor)"

echo ""
echo "=== Tamamlandı! ==="
docker compose ps
