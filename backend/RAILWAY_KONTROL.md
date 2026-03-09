# Railway "Application failed to respond" – Kontrol Listesi

## 1. Deploy Loglarını İnceleyin

Railway → **Backend** servisi → **Deployments** → en son deploy → **View Logs**

**Aranacak satırlar:**
- `[startup] Node` – Görünüyorsa uygulama başladı
- `[db] Veri dosyası:` – DB init OK
- `LimonPOS Backend running on` – Sunucu dinliyor
- `[CRASH]` veya `Error` – Çökme sebebi

**Logda hiçbir şey yoksa:** Root Directory yanlış olabilir.

---

## 2. Root Directory = backend

**Settings** → **Source** → **Root Directory:** tam olarak **`backend`** yazın.

Yanlışsa: `Cannot find module`, `server.js not found` gibi hatalar görürsünüz.

---

## 3. Volume + DATA_DIR (opsiyonel ama önerilen)

**Volumes** → Add Volume → **Mount Path:** `/data`  
**Variables** → `DATA_DIR` = `/data`

Volume yoksa veriler her deploy'da silinir ama uygulama çalışmalı.

---

## 4. Geçici: Volume'u Kaldırın

Hâlâ "failed to respond" alıyorsanız:

1. **Volumes** → Volume'u silin
2. **Variables** → `DATA_DIR`'i silin (veya boş bırakın)
3. **Redeploy**

Uygulama `backend/data.json` ile çalışır (kalıcı değil ama en azından ayağa kalkar).

---

## 5. PORT

Railway otomatik `PORT` verir. Variables'da `PORT=3002` eklemeniz gerekmez; ekleseniz de sorun olmaz.
