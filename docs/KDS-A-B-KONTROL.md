# KDS: A cihazından B cihazında sipariş görünmüyorsa

## Bu 3 şart mutlaka sağlanmalı

### 1. Aynı sunucu adresi (en sık hata)
- **Tablet A** ve **Tablet B** (ve KDS açık olan cihaz) hepsi **aynı Primary adresi** kullanmalı.
- Laptop backend kullanıyorsan: **Primary = `http://192.168.137.1:3002/api/`** (hotspot’ta laptop IP genelde bu).
- Uygulama içi: **Ayarlar → Sunucu adresi → Primary** aynı olsun. Biri cloud biri laptop ise veri birleşmez.

### 2. Backend açık
- Laptop’ta backend çalışıyor olmalı: `start-offline.bat` veya `node server.js` (backend klasöründe).
- Kontrol: Tarayıcıda `http://localhost:3002/api/health` aç → `{"ok":true}` görmelisin.

### 3. Firewall (tabletler laptop’a bağlanacaksa)
- Laptop’ta port 3002 açık olmalı. PowerShell’i **Yönetici** olarak aç:
  ```powershell
  cd C:\Users\Dell\LimonPOS
  .\scripts\firewall-allow-backend.ps1
  ```

---

## Hâlâ B’de görünmüyorsa

- B tabletinde KDS ekranında “Sipariş yok” yazıyorsa altında **“A ve B tablette Ayarlar → Sunucu adresi aynı olmalı”** uyarısı çıkar. Önce Primary adresleri kontrol et.
- Her iki tablet de **aynı WiFi / hotspot**’a bağlı olsun (laptop hotspot kullanıyorsan ikisi de ona bağlı).
- Backend’i bir kez yeniden başlat, sonra A’dan “Mutfağa gönder” yapıp 5–10 saniye bekle; B’de KDS’i aç veya yenile.
