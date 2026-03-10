#!/bin/bash
# LimonPOS Hetzner sunucu kurulum scripti
# Kullanım: Proje kök dizininde çalıştırın (git clone sonrası)

set -e

echo "=== LimonPOS Docker Kurulumu ==="

# 1. DOCKER YAPILANDIRMASI (mevcut yapıya uyumlu)
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || echo "77.42.70.162")
cat <<EOF > docker-compose.yml
services:
  db:
    image: postgres:16-alpine
    container_name: postgres
    restart: always
    environment:
      POSTGRES_USER: posuser
      POSTGRES_PASSWORD: rv7RAingkwfq
      POSTGRES_DB: limonpos
    ports:
      - "5432:5432"
    volumes:
      - db-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U posuser -d limonpos"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    restart: always
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  backend:
    build:
      context: .
      dockerfile: backend/Dockerfile
    container_name: limonpos-backend
    restart: always
    ports:
      - "3002:3002"
    environment:
      DATABASE_URL: "postgresql://posuser:rv7RAingkwfq@db:5432/limonpos"
      PORT: 3002
      NODE_ENV: production
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy

  frontend:
    build:
      context: ./pos-backoffice
      dockerfile: Dockerfile
      args:
        NEXT_PUBLIC_API_URL: "http://${SERVER_IP}:3002/api"
    environment:
      - PORT=3000
    container_name: limonpos-frontend
    restart: always
    ports:
      - "3000:3000"
    depends_on:
      - backend

volumes:
  db-data:
EOF

# 2. BACKEND .env (Docker içi bağlantı)
mkdir -p backend
cat <<'EOF' > backend/.env.docker
DATABASE_URL="postgresql://posuser:rv7RAingkwfq@db:5432/limonpos"
EOF

# 4. SİSTEMİ AYAĞA KALDIR
echo "Docker build ve start..."
docker compose up -d --build

# 4. GÜVENLİK DUVARI
ufw allow 3000/tcp 2>/dev/null || true
ufw allow 3002/tcp 2>/dev/null || true
ufw allow 5432/tcp 2>/dev/null || true

# 6. VERİTABANI KURULUMU
echo "Veritabanının hazır olması bekleniyor (20 sn)..."
sleep 20

echo "Prisma db push..."
docker exec limonpos-backend npx prisma db push --schema=prisma/schema.prisma

# data.json varsa migrate et
if [ -f backend/data.json ]; then
  echo "data.json bulundu, migration başlatılıyor..."
  docker exec limonpos-backend node scripts/migrate-data.js || echo "Migration atlandı veya hata"
else
  echo "data.json yok - temiz kurulum. İsterseniz sonra migrate-data.js ile taşıyabilirsiniz."
fi

# 6. BİLGİLER
echo ""
echo "=========================================="
echo "✅ KURULUM BİTTİ!"
echo "👉 API: http://$(curl -s ifconfig.me 2>/dev/null || echo 'SUNUCU_IP'):3002"
echo "👉 Backoffice: http://$(curl -s ifconfig.me 2>/dev/null || echo 'SUNUCU_IP'):3000/pos"
echo "👉 Health: http://$(curl -s ifconfig.me 2>/dev/null || echo 'SUNUCU_IP'):3002/api/health"
echo "👉 Loglar: docker logs -f limonpos-backend"
echo "=========================================="
