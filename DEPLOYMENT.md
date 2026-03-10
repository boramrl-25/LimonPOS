# Hetzner Sunucu Deployment - LimonPOS

**Sunucu:** 77.42.70.162 (Ubuntu 24.04)

## Adım 1: SSH ile bağlan

```bash
ssh root@77.42.70.162
```

## Adım 2: Docker kurulumu

```bash
# Güncellemeler
apt update && apt upgrade -y

# Docker kurulumu
curl -fsSL https://get.docker.com | sh

# Docker'ı başlat ve otomatik başlatmayı etkinleştir
systemctl enable docker
systemctl start docker

# Docker Compose (Docker 24+ ile plugin olarak gelir)
docker compose version
```

## Adım 3: Projeyi sunucuya al

### Seçenek A: Git clone (repo public ise)

```bash
cd /opt
git clone https://github.com/YOUR_ORG/LimonPOS.git
cd LimonPOS
```

### Seçenek B: rsync ile lokalinizden yükle

```bash
# Lokal makineden çalıştır (PowerShell veya WSL):
rsync -avz --exclude node_modules --exclude .git --exclude app/build ./ root@77.42.70.162:/opt/LimonPOS/
```

### Seçenek C: SCP ile zip gönder

```bash
# Lokal: zip oluştur
# Windows PowerShell:
Compress-Archive -Path * -DestinationPath limonpos.zip -Force

# SCP ile gönder
scp limonpos.zip root@77.42.70.162:/opt/
# Sunucuda:
cd /opt && unzip -o limonpos.zip -d LimonPOS && cd LimonPOS
```

## Adım 4: Ortam değişkenleri

```bash
cd /opt/LimonPOS

# .env.docker zaten backend/ içinde - production için şifreyi değiştir:
nano backend/.env.docker
# DATABASE_URL="postgresql://posuser:GÜÇLÜ_ŞİFRE@db:5432/limonpos"
# docker-compose.yml içindeki POSTGRES_PASSWORD ile aynı olmalı
```

**Güvenli şifre örneği:** `openssl rand -base64 24`

## Adım 5: docker-compose ile başlat

```bash
cd /opt/LimonPOS
docker compose up -d --build
```

## Adım 6: Veritabanı tabloları

```bash
# İlk kez: schema'yı uygula
docker compose exec api npx prisma db push

# (Opsiyonel) data.json'dan mevcut verileri taşı
# data.json'u sunucuya kopyala, sonra:
docker compose exec -e DATABASE_URL="postgresql://posuser:ŞİFRE@db:5432/limonpos" api node scripts/migrate-data.js
```

## Adım 7: Sağlık kontrolü

```bash
curl http://77.42.70.162:3002/api/health
# {"ok":true,"message":"LimonPOS API",...}
```

## Hızlı komut özeti (sırayla)

1. `ssh root@77.42.70.162`
2. `apt update && apt upgrade -y`
3. `curl -fsSL https://get.docker.com | sh`
4. `systemctl enable docker && systemctl start docker`
5. `cd /opt && git clone ... veya rsync/scp ile proje yükle`
6. `cd /opt/LimonPOS`
7. `nano backend/.env.docker` — `DATABASE_URL` şifresini güncelle
8. `nano docker-compose.yml` — `POSTGRES_PASSWORD` ile eşleştir
9. `docker compose up -d --build`
10. `docker compose exec api npx prisma db push`
11. (Opsiyonel) `docker compose exec api node scripts/migrate-data.js`

## Firewall

```bash
ufw allow 22
ufw allow 3002
ufw enable
```
