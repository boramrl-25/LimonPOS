# Railway'de API "Crashed" – Ne Yaptık, Ne Kontrol Etmeli?

## Kodda yapılan düzeltmeler

1. **db.js – Veritabanı başlatma**
   - Önce `DATA_DIR` / `data.json` deneniyor.
   - Olmazsa `backend/data.json` (yedek konum) deneniyor.
   - İkisi de başarısız olursa artık **process çökmüyor**; sadece bellekte geçici veri ile çalışıyor (restart’ta silinir). Log’da uyarı görünür.

2. **server.js – Hata yakalama**
   - `uncaughtException` ve `unhandledRejection` dinleniyor; hata loglanıp `process.exit(1)` ile çıkılıyor. Böylece Railway process’i yeniden başlatır, sessiz çökme olmaz.
   - Sunucu dinlenmeden önce `ensureData()` bir kez çalıştırılıyor; hata olursa log’a yazılıyor ama sunucu yine de ayağa kalkıyor (en azından `/api/health` cevap verir).

## Railway tarafında kontrol listesi

1. **Root Directory**
   - Backend servisi → **Settings** → **Source** → **Root Directory:** `backend` (tam bu kelime).

2. **Volume + DATA_DIR** (veriler kalıcı olsun diye)
   - **Volumes** → Add Volume → **Mount Path:** `/data`
   - **Variables** → `DATA_DIR` = `/data`

3. **PORT**
   - Railway genelde `PORT`’u kendisi verir. Backend’te `process.env.PORT || 3002` kullanılıyor, ekstra ayar gerekmez.

4. **Logları inceleyin**
   - Railway → Backend servisi → **Deployments** → son deploy → **View Logs**.
   - `[CRASH] uncaughtException:` veya `[CRASH] unhandledRejection:` görürseniz yanındaki mesaj çökme sebebidir.
   - `[db] UYARI: Sadece bellek kullanılıyor` görürseniz Volume/DATA_DIR eksik veya yanlış demektir.

5. **Yeniden deploy**
   - Bu değişiklikleri GitHub’a push edin. Railway otomatik deploy alır.
   - Manuel redeploy: Railway → Backend servisi → **Deployments** → **Redeploy**.

## Hâlâ crashed görünüyorsa

- Log’daki **tam hata mesajını** (kırmızı satır) kopyalayın.
- Root Directory’nin `backend` olduğundan emin olun.
- Gerekirse Variables’dan `DATA_DIR`’i geçici kaldırıp (Volume’u da kaldırın) tekrar deploy edin; uygulama yedek konumda veya bellek modunda açılmaya çalışır, böylece en azından “crashed” kalkar.
