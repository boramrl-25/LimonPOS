# Offline Kurulum - Local Backend

## 1. PostgreSQL servisi

PostgreSQL 16 kuruldu. Servis kapaliysa:

**Services** (Win+R → `services.msc`) ac → **postgresql-x64-16** bul → **Start**

Veya PowerShell (Admin):
```powershell
Start-Service postgresql-x64-16
```

## 2. limonpos veritabani

PostgreSQL calisiyorsa, pgAdmin veya psql ile:

```sql
CREATE DATABASE limonpos;
```

Veya backend migration otomatik olusturur (prisma db push).

## 3. .env offline

`backend\.env` icinde:
```
DATABASE_URL="postgresql://postgres:SIFRE@localhost:5432/limonpos"
```
(SIFRE = PostgreSQL kurulumunda girdigin sifre, genelde "postgres")

## 4. Migration ve backend

```powershell
cd backend
.\scripts\run-migration.ps1
node server.js
```

## 5. Tablet

Primary: `http://192.168.1.50:3002/api/`

---
Interneti kapat → offline test et.
