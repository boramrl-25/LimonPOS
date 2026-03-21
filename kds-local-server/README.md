# LimonPOS — KDS yerel sunucu (LAN)

Bulut gerekmez. POS (Android) mutfağa giden satırları buraya `POST /api/kds/orders/push` ile yollar; KDS tabletleri aynı Wi‑Fi üzerinden `GET /api/kds/orders` ile listeler.

## Çalıştırma

```bash
cd kds-local-server
npm install
set KDS_PUSH_SECRET=benim-gizli-anahtarim
set KDS_PIN=8030
node server.js
```

Varsayılan port: **3099**.

## POS ayarı

Sunucu URL (WiFi) ekranında **KDS LAN base URL** örneği: `http://192.168.1.50:3099`  
**KDS push secret**, sunucudaki `KDS_PUSH_SECRET` ile aynı olmalı.

## Hetzner notu

Bu servis **mutfak LAN’ında** bir PC/Raspberry/NAS üzerinde çalışmalı. Hetzner (bulut) üzerinde çalıştırmak, “KDS buluta bağlı değil” hedefiyle çelişir; bulut tarafı mevcut **api.the-limon.com** POS senkronu için kalır.

## Uçlar

| Method | Path | Açıklama |
|--------|------|----------|
| GET | `/health` | Sağlık |
| POST | `/api/kds/orders/push` | POS snapshot (header `X-KDS-Secret`) |
| POST | `/api/kds/auth` | Body `{"pin":"8030"}` → Bearer token |
| GET | `/api/kds/orders` | Authorization: Bearer … |
| PATCH | `/api/kds/orders/:orderId/items/:itemId/status` | Kalem durumu |

Bulut floor ile uyum için: POS zaten bulut API’ye `sent_at` / item `status` gönderiyor; KDS’deki PATCH yalnızca yerel kuyruğu günceller — ileride webhook ile buluta da iletilebilir.
