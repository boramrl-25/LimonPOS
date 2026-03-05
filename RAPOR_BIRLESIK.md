# LimonPOS Backend – Birleşik Sorun Tespit ve Öneri Raporu

Bu rapor, **LowDB (tek `data.json`) + Node.js/Express** mimarisi üzerine yapılan iki incelemenin birleştirilmiş halidir.

---

## 1. Yönetici Özeti (Root Cause)

### Ana sorunlar

1. **LowDB eşzamanlı yazma (race condition)**  
   Web back-office ve Android POS aynı anda API’ye yazınca, tek JSON dosyasında lost update oluşuyor; son yazan öncekinin değişikliğini ezer.

2. **Deploy/restart sonrası veri silinmesi (kalıcılık)**  
   Volume ve `DATA_DIR` yoksa, `data.json` ephemeral diskte kalıyor; deploy/restart ile veri kayboluyor.

3. **“Önce sil sonra senkronla” endpoint’leri**  
   `clear-and-sync` benzeri akışlar: Zoho hata verirse veya senkron yarım kalırsa tüm ürünler silinmiş kalıyor.

---

## 2. Bulgular ve Etki

| Öncelik | Sorun | Etki | Öneri |
|---------|-------|------|-------|
| **P0** | LowDB race condition | Rastgele veri kaybı | File-lock veya DB’ye geçiş |
| **P0** | Deploy/restart wipe | Komple veri kaybı | Railway Volume + `DATA_DIR=/data` |
| **P1** | clear-and-sync yıkıcı tasarım | Toplu ürün silinmesi | Upsert modeli, staging |
| **P1** | Yetkilendirme / kazara tetikleme | Kontrolsüz toplu işlem | Admin-only + onay + rate limit |
| **P2** | Log/audit eksikliği | Kök neden kanıtsız kalır | Request-id + write audit log |

---

## 3. Öneriler (Birleşik Liste)

### Hemen (P0)

1. **Railway persistence**
   - Volume ekle, mount path: `/data`
   - Variable: `DATA_DIR=/data`  
   *Durum: Yapıldı. Health’te `persistent_storage: true` görünüyor.*

2. **LowDB write kilidi**
   - `proper-lockfile` veya benzeri ile `db.write()` öncesi lock
   - Tek seferde tek yazma (serialize)
   - Race condition riskini büyük ölçüde azaltır

3. **clear-and-sync’i kısıtla**
   - Admin-only veya kullanım dışı bırak
   - Kazara toplu silme riskini azaltır

### Kısa–orta vade (P1)

4. **Senkronu upsert modeline çevir**
   - Önce sil, sonra çek yerine: Zoho item id ile güncelle/ekle
   - Zoho’da kaldırılanlar için soft delete veya raporlama
   - Zoho hata verse bile mevcut veri korunur

5. **Destructive endpoint’lere ek güvenlik**
   - Admin token/role zorunlu
   - Rate limit
   - İkinci doğrulama (örn. `X-Confirm-Action` header)

6. **Loglama / audit**
   - Her write: endpoint, user/device id, request id, timestamp
   - DB dosya boyutu ve son değişim zamanı metrikleri

### Kalıcı (Uzun vade)

7. **LowDB → PostgreSQL / MongoDB migration**
   - Transaction + row-level locking
   - Atomik güncelleme, ölçeklenebilirlik
   - Eşzamanlı yazma için mimari gereklilik

8. **Opsiyonel: Redis distributed lock**
   - Birden fazla backend instance varsa gerekir
   - Şu an tek instance için zorunlu değil

---

## 4. En Muhtemel Senaryo (Sizin durum)

Tarif edilen “senkron sorunları + veri silinmesi” genelde:

1. Android ve web aynı anda yazıyor → **race condition** → bazı kayıtlar kayboluyor  
2. Deploy/restart → `data.json` ephemeral diskte → **her şey sıfırlanıyor**

Bu ikisi birlikte “sistem kafasına göre siliyor” hissi yaratıyor.

---

## 5. Öncelikli Yol Haritası

| Aşama | Ne yapılacak |
|-------|--------------|
| **A) Hemen** | 1) Volume + DATA_DIR (yapıldı), 2) File-lock, 3) clear-and-sync kısıtlaması |
| **B) Kısa–orta** | 4) Upsert senkron, 5) Admin-only/onay, 6) Audit log |
| **C) Kalıcı** | 7) PostgreSQL/MongoDB migration |

---

## 6. Railway Kontrol Listesi

- [ ] Volume var mı? Mount path `/data` mı?
- [ ] `DATA_DIR=/data` variable tanımlı mı?
- [ ] Health’te `data_dir: "/data"` ve `persistent_storage: true` görünüyor mu?
- [ ] `PORT` variable’ı kaldırıldı mı? (Railway kendi portunu kullansın, 8080)
