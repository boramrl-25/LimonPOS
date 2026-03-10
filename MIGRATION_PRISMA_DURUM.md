# Prisma Migration – Mevcut Durum

## Tamamlanan

### 1. Prisma altyapısı
- **prisma/schema.prisma** – PostgreSQL şeması (User, Order, Product, Category, Table, Settings, ZohoConfig, VoidLog, OrderItem, Payment, Printer, ModifierGroup, PaymentMethod, vb.)
- **backend/lib/prisma.js** – PrismaClient singleton, `DATABASE_URL` kullanır
- **backend/lib/store.js** – Veri erişim katmanı (getUsers, getSettings, getZohoConfig, getOrders, vb.)

### 2. package.json script'leri
```json
"postinstall": "prisma generate",
"db:generate": "prisma generate",
"db:push": "prisma db push",
"db:migrate": "prisma migrate dev",
"db:studio": "prisma studio"
```
- **prisma schema path:** `"prisma": { "schema": "../prisma/schema.prisma" }` (backend'den çalıştırma için)

### 3. backend/.env.docker
```
DATABASE_URL="postgresql://posuser:pospass@db:5432/limonpos"
```

### 4. Docker (mevcut)
- docker-compose.yml (db, redis, api)
- backend/Dockerfile (Node 18, prisma generate dahil)

---

## Yapılacaklar (Server tam geçiş)

Backend hâlâ LowDB (`db.js`) kullanıyor. Tam Prisma geçişi için:

1. **migrate-data.ts** – `data.json` → PostgreSQL aktarım script'i
2. **server.js refaktör** – 90+ endpoint, tüm `db.data.*` → Prisma/store
3. **zoho.js** – `db` kullanımı → Prisma
4. **reconciliation.js** – `db` kullanımı → Prisma
5. **db.js silinmesi** – LowDB tamamen kaldırılacak

---

## .env

DigitalOcean PostgreSQL:
```env
DATABASE_URL="postgresql://user:password@your-db-host:25060/limonpos?sslmode=require"
```

Lokal Docker:
```env
DATABASE_URL="postgresql://posuser:pospass@localhost:5432/limonpos"
```

---

## Prisma komutları

```bash
cd backend
npm run db:generate   # Prisma client üret
npm run db:push       # Şemayı DB'ye uygula (migration olmadan)
npm run db:migrate    # Migration ile
npm run db:studio     # Prisma Studio (GUI)
```

---

## Sıralama

1. PostgreSQL oluştur (DigitalOcean / Docker)
2. `prisma db push` ile tabloları oluştur
3. `migrate-data.ts` ile `data.json` → SQL aktar
4. server.js, zoho.js, reconciliation.js refaktörü
5. db.js sil, LowDB dependency kaldır
