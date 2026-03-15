# Offline: App Giriş + Backoffice Haberleşmesi

## Neden giriş olmuyor / backoffice haberleşmiyor?

1. **Tabletler backend'e ulaşamıyor** (yanlış adres veya firewall)
2. **Backend kapalı**
3. **Primary URL offline için local değil**

---

## Adım adım (laptop hotspot ile)

### 1. Laptop'ta (bir kez) – Firewall

**PowerShell'i Yönetici olarak aç**, proje klasörüne gel, çalıştır:

```powershell
.\scripts\firewall-allow-backend.ps1
```

Böylece tabletler `192.168.137.1:3002` adresine bağlanabilir.

### 2. Laptop'ta – Backend + Backoffice

- **start-offline.bat** çalıştır  
  veya  
- `backend` → `node server.js`  
- `pos-backoffice` → `npm run dev`  
- Backoffice: **http://localhost:3000**

### 3. Tablette – Sunucu ayarları (offline için)

Hotspot kullanıyorsan laptop'un IP'si genelde **192.168.137.1** olur.

- **Primary:** `http://192.168.137.1:3002/api/`
- **Secondary:** boş bırakılabilir
- **Tertiary:** `https://api.the-limon.com/api/` (internet gelince yedek)

Önemli: Offline kullanacaksan **Primary mutlaka local backend** (yukarıdaki gibi) olmalı. Primary'yi cloud yaparsan app önce cloud'a gider, offline'da giriş yapamaz.

### 4. Tableti hotspot'e bağla

- WiFi'den laptop'un hotspot'ini seç (örn. "DESKTOP-... 5456").
- Şifreyi gir.

### 5. Uygulamada giriş

- PIN: Backend'de tanımlı kullanıcı PIN'i (örn. 1234 veya kendi kullanıcıların).

---

## Backoffice "haberleşmiyor" ne demek?

- Backoffice, **aynı laptop'taki backend'e** (localhost:3002) bağlanır.
- Tabletler de **laptop'un IP'si:3002** ile aynı backend'e gider.
- Yani **hepsi aynı backend'i kullanır**; backoffice'te gördüğün siparişler/veriler, tabletten atılanlarla aynıdır.

Backoffice'te bir şey görmüyorsan: Backend çalışıyor mu kontrol et (http://localhost:3002/api/health). Çalışıyorsa ve tabletler giriş yapabiliyorsa, backoffice de aynı veriyi gösterir.

---

## TLF A / B birbirini görmüyor / KDS çalışmıyor

- Tüm tabletler (TLF A, B, KDS) **aynı Primary URL** kullanmalı (örn. `http://192.168.137.1:3002/api/`). Farklı adres = veriler birleşmez.
- KDS siparişleri backend'den alır; "Send to kitchen" sonrası birkaç saniyede KDS'de görünür. Uygulama ~5 sn'de bir senkron yapar.
- Çok yavaşsa: firewall (port 3002), tüm cihazların aynı WiFi/hotspot'ta olduğunu kontrol et.

---

## Özet

| Nerede       | Ne yapılacak |
|-------------|--------------|
| Laptop      | Firewall port 3002 açık, backend + backoffice çalışıyor |
| Tablet      | Primary = `http://192.168.137.1:3002/api/`, hotspot'e bağlı |
| Tüm TLF/KDS | Aynı Primary URL (hepsi aynı backend) |
| Giriş       | Backend'de tanımlı PIN (örn. 1234) |
