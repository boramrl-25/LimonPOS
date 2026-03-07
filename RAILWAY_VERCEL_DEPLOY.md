# Railway + Vercel ile Deploy

- **Backend (API)** → **Railway**
- **Backoffice (Web)** → **Vercel**

---

## 1. Backend → Railway

### Ilk kurulum (bir kez)
1. [railway.app](https://railway.app) → Proje → **+ New** → **GitHub Repo** → LimonPOS seçin.
2. Olusan serviste **Settings** → **Source** → **Root Directory:** `backend`
3. **Volumes** → **Add Volume** → Mount Path: `/data` (veriler silinmesin)
4. **Variables** → `DATA_DIR` = `/data`, `PORT` = `3002`
5. **Settings** → **Networking** → **Generate Domain** veya Custom: `api.the-limon.com`

### Deploy (CLI)
```powershell
railway login
cd backend
railway link   # Ilk kez: Backend servisini secin
railway up
```

---

## 2. Backoffice → Vercel

### Ilk kurulum (bir kez)
1. [vercel.com](https://vercel.com) → **Add New** → **Project** → GitHub’dan **LimonPOS** secin.
2. **Root Directory:** `pos-backoffice` olarak ayarlayin (Edit).
3. **Environment Variables** ekleyin:
   - `NEXT_PUBLIC_API_URL` = `https://api.the-limon.com/api`
4. **Deploy** ile ilk deploy tetiklenir.
5. **Settings** → **Domains** → `pos.the-limon.com` ekleyin (DNS’te CNAME: `pos` → `cname.vercel-dns.com`).

### Deploy (CLI)
```powershell
npm i -g vercel
cd pos-backoffice
vercel login
vercel link     # Ilk kez: Projeyi secin
vercel --prod
```

---

## 3. Tek script ile (Railway + Vercel)

Proje kokunde:

```powershell
.\deploy-railway-vercel.ps1
```

Onceden `railway login`, `railway link` (backend), `vercel login`, `vercel link` (pos-backoffice) yapilmis olmali.

---

## Kontrol

| Servis | URL |
|--------|-----|
| API | https://api.the-limon.com/api/health |
| Web | https://pos.the-limon.com veya Vercel’in verdigi *.vercel.app |
