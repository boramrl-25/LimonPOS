#!/bin/bash
# =================================================================
# LIMONPOS ULTIMATE DEPLOYER (OPTIMIZED FOR CURSOR)
# =================================================================
# Sunucuda çalıştırın: bash deploy.sh

set -e
cd "$(dirname "$0")"

# 1. DIZIN VE GITHUB SENKRONIZASYONU
echo "=== 1. GitHub senkronizasyonu... ==="
git reset --hard HEAD && git pull origin main

# 2. PROJE YAPISINA UYGUN DOCKER-COMPOSE (Healthcheck Dahil)
echo ""
echo "=== 2. Docker Compose yapılandırması... ==="
cat <<EOF > docker-compose.yml
services:
  db:
    image: postgres:16-alpine
    container_name: postgres
    restart: always
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: rv7RAingkwfq
      POSTGRES_DB: limonpos
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d limonpos"]
      interval: 5s
      timeout: 5s
      retries: 5
    volumes:
      - db-data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    container_name: limonpos-redis
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
      DATABASE_URL: "postgresql://postgres:rv7RAingkwfq@db:5432/limonpos?schema=public"
      PORT: 3002
      NODE_ENV: production
      DATA_DIR: /data
    volumes:
      - limonpos_data:/data
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
        NEXT_PUBLIC_API_URL: http://77.42.70.162:3002/api
    container_name: limonpos-frontend
    restart: always
    ports:
      - "3000:3000"
    environment:
      NEXT_PUBLIC_API_URL: http://77.42.70.162:3002/api
    depends_on:
      - backend

volumes:
  db-data:
  limonpos_data:
EOF

# 3. BACKEND .ENV DOSYASINI HAZIRLA
cat <<EOF > backend/.env
DATABASE_URL="postgresql://postgres:rv7RAingkwfq@db:5432/limonpos?schema=public"
PORT=3002
NODE_ENV=production
EOF

# 4. IMAJLARI INSA ET
echo ""
echo "=== 3. Docker imajları inşa ediliyor... (Next.js build biraz zaman alabilir) ==="
docker compose build

# 5. ÖNCE SADECE DB VE REDIS BAŞLAT (Backend tablolar oluşmadan başlamasın)
echo ""
echo "=== 4. Veritabanı ve Redis başlatılıyor... ==="
docker compose up -d db redis

echo ""
echo "=== 5. DB hazır olana kadar bekleniyor... ==="
sleep 25

# 6. TABLOLARI OLUŞTUR (Backend başlamadan önce!)
echo ""
echo "=== 6. Veritabanı tabloları oluşturuluyor... ==="
echo "💾 Prisma Schema Push..."
docker compose run --rm backend npx prisma db push --schema=prisma/schema.prisma

echo "🌱 Başlangıç verileri yükleniyor (seed)..."
docker compose run --rm backend npx prisma db seed --schema=prisma/schema.prisma

# 7. BACKEND VE FRONTEND BAŞLAT (Tablolar hazır)
echo ""
echo "=== 7. Backend ve Frontend başlatılıyor... ==="
docker compose up -d backend frontend

# 8. FIREWALL VE ERISIM BILGILERI
echo ""
echo "=== 8. Güvenlik duvarı (ufw)... ==="
ufw allow 3000/tcp 2>/dev/null || true
ufw allow 3002/tcp 2>/dev/null || true
ufw reload 2>/dev/null || true

echo ""
echo "================================================================="
echo "✅ KURULUM TAMAMLANDI!"
echo "-----------------------------------------------------------------"
echo "🌐 Arayüz (Backoffice): http://77.42.70.162:3000/pos"
echo "⚙️  API Durumu        : http://77.42.70.162:3002/api/health"
echo "-----------------------------------------------------------------"
echo "💡 İpucu: Giriş yapamazsanız 'docker compose logs backend' yazın."
echo "================================================================="
