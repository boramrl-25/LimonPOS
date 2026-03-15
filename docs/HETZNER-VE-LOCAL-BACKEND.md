# Hetzner deploy + Local backend kullanımı

## 1. Hetzner'a push (deploy)

Kod zaten GitHub'da. Hetzner sunucusuna almak için:

### Seçenek A — SSH key varsa (tek komut)
PowerShell'de proje klasöründe:
```powershell
.\deploy-ssh.ps1 -SkipCommit
```
- GitHub ve Hetzner için SSH key tanımlı olmalı.
- Script: GitHub'a push eder, sonra Hetzner'da `git pull` + `docker compose up -d --build` çalıştırır.

### Seçenek B — SSH key yoksa (manuel)
1. GitHub'a normal push (zaten yaptıysan atla):
   ```powershell
   git push origin main
   ```
2. Hetzner sunucusuna SSH ile bağlan:
   ```powershell
   ssh root@77.42.70.162
   ```
3. Sunucuda:
   ```bash
   cd /root/LimonPOS
   git fetch origin
   git reset --hard origin/main
   docker compose up -d --build
   ```

API kontrol: https://api.the-limon.com/api/health

---

## 2. Local backend'e nasıl gidilir?

Laptop’ta backend’i kendin çalıştırıp tablet/backoffice’i ona bağlamak için:

### Laptop’ta
1. **Backend:** `backend` klasöründe `node server.js` (veya **start-offline.bat**).
2. **Backoffice (isteğe bağlı):** `pos-backoffice` klasöründe `npm run dev` → tarayıcıda http://localhost:3000
3. **Firewall:** Tabletler bağlansın diye port 3002 açık olmalı:
   ```powershell
   .\scripts\firewall-allow-backend.ps1   # Yönetici olarak
   ```

### Backend hangi veritabanına gidecek?
- **backend\.env** içindeki `DATABASE_URL` ne ise oraya gider:
  - **Local DB:** `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/limonpos"`  
    → Sadece bu laptop’taki PostgreSQL’i kullanır (offline).
  - **Hetzner DB:** `DATABASE_URL="postgresql://KULLANICI:SIFRE@77.42.70.162:5432/limonpos"`  
    → Aynı veritabanına gider; laptop sadece “sunucu” gibi çalışır, veri Hetzner’da kalır.

### Tablette (local backend kullanacaksan)
- Uygulama içi **Ayarlar → Sunucu adresi**
- **Primary:** `http://LAPTOP_IP:3002/api/`  
  - Aynı WiFi’de: laptop’un yerel IP’si (örn. 192.168.1.50)  
  - Laptop hotspot ise: genelde `http://192.168.137.1:3002/api/`

### Özet
| Kullanım           | Backend nerede | DATABASE_URL (backend\.env) | Tablet Primary        |
|--------------------|----------------|-----------------------------|------------------------|
| Sadece Hetzner     | Hetzner        | —                           | https://api.the-limon.com/api/ |
| Local (offline)    | Laptop         | localhost PostgreSQL        | http://LAPTOP_IP:3002/api/     |
| Local ama Hetzner DB | Laptop       | 77.42.70.162 PostgreSQL     | http://LAPTOP_IP:3002/api/     |
