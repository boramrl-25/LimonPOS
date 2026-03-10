# Railway Build Hatası Çözümü

Hata: `"/backend": not found` – Root Directory = `backend` iken build context sadece backend klasörü oluyor, `COPY backend/` ve `COPY prisma` çalışmıyor.

## Yapılan Değişiklikler (repo'da)

- `Dockerfile.railway` – Repo kökünde, `backend/` ve `prisma/` ile build
- `railway.toml` – `builder = DOCKERFILE`, `dockerfilePath = Dockerfile.railway`

## Tek Yapmanız Gereken

1. [Railway](https://railway.app) → LimonPOS → Backend servisi → **Settings**
2. **Source** → **Root Directory:** alanını **tamamen boş bırakın** (silin)
3. **Redeploy** tetikleyin (Deployments → Redeploy veya GitHub push)

Root Directory boş olduğunda build context = repo root olur; `Dockerfile.railway` hem `backend/` hem `prisma/` klasörlerine erişir.
