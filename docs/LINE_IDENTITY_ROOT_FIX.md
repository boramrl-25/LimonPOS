# Kök Çözüm: Line Identity + Monotonic Sync

## Actual Root Cause

1. **Satır kimliksizliği**: Eşleme `productId|productName|price|notes` fuzzy key ile yapılıyordu. Aynı ürün farklı satırlar olarak eklenince API duplicate line oluşturuyor, sync pull bu satırları birleştirip quantity topluyordu → 4x, 8x, 204x patlaması.

2. **Delete-all + rebuild**: `syncOrdersFromApi` ve `refreshOrderFromApi` her seferinde `deleteOrderItems` yapıp tüm satırları yeniden insert ediyordu. Local identity (id, apiId) kayboluyordu.

3. **Fuzzy merge**: API'den gelen aynı product+price+notes satırları tek satırda toplanıyor, quantity sum ediliyordu. Retry/race durumunda API duplicate oluşunca miktar şişiyordu.

4. **ready regression**: `resolveStatusForSync` vardı ama delete+insert sonrası satır id değişince `localByApiId` ve `localByLineKey` eşlemesi kırılabiliyordu. Merge sırasında wrong local match → status ezilebiliyordu.

5. **sentAt overwrite**: `resolveSentAtForSync` fuzzy key fallback kullanıyordu; merge/deletion sonrası match yanlış olunca sentAt API ile eziliyordu.

6. **ensureOrderExistsOnApi fuzzy qty**: Line key ile gruplama, toAddQty hesaplama, aynı product'tan birden fazla API line oluşmasına yol açıyordu.

---

## Why Previous Fixes Were Insufficient

- `orderItemLineKeyNoQty` sadece quantity'yi key'den çıkardı; hâlâ fuzzy key (product+price+notes) ile eşleme vardı.
- Delete-all + rebuild kaldı; local identity korunmuyordu.
- Merge ve quantity toplama devam etti; duplicate API line'lar tek satırda toplanıp quantity şişiyordu.
- `sendOrderToKitchen` sync'ten ayrılmıştı ama sync pull hâlâ kırılgandı.

---

## New Line Identity Design

| Alan | Rol |
|------|-----|
| `clientLineId` | POS'un oluşturduğu UUID. Kalıcı kimlik. |
| `apiId` | Backend'in döndüğü id (apiLineId). |
| `id` | Primary key. Yeni satırlarda id = clientLineId. |

- Eşleme: önce `clientLineId`, yoksa `apiId`.
- Fuzzy key sadece geçici fallback değil; **artık kullanılmıyor**.
- Her satır tek bir line identity ile temsil ediliyor.

---

## Files Changed

| Dosya | Değişiklik |
|-------|------------|
| `OrderItemEntity.kt` | `clientLineId` eklendi, index |
| `AppDatabase.kt` | MIGRATION_15_16, version 16 |
| `DatabaseModule.kt` | MIGRATION_15_16 eklendi |
| `OrderDto.kt` | `OrderItemDto`: `clientLineId`, `deliveredAt`; `AddOrderItemRequest`: `clientLineId` |
| `OrderRepository.kt` | Yeni item: `clientLineId = UUID`, `id = clientLineId` |
| `ApiSyncRepository.kt` | `upsertOrderItemsFromApi`, `ensureOrderExistsOnApi` line-identity, `syncOrdersFromApi`/`refreshOrderFromApi` upsert, `pushAddOrderItem`/`pushUpdateOrderItem` clientLineId gönderimi |
| `backend/server.js` | POST /orders/:id/items: `client_line_id` kabul, idempotent update |

---

## Migration Added

- **MIGRATION_15_16**: `order_items` tablosuna `clientLineId TEXT NULL` kolonu eklenir.
- Mevcut verilerde `clientLineId` null; eski satırlar `apiId` ile eşleşir.

---

## Conflict Resolution Rules

| Alan | Kural |
|------|-------|
| **status** | Monotonic: delivered > ready > preparing > sent > pending. Local yüksekse local kazanır. |
| **sentAt** | Immutable. Local doluysa değişmez; null → API veya local. |
| **quantity** | Her satır kendi quantity'sine sahip; merge/sum yok. |
| **deleted** | Local'de apiId var, API'de yok → satır silinmiş; local'den sil. |

---

## Why Quantity No Longer Explodes

1. **client_line_id ile idempotency**: Aynı satır tekrar push edilince backend update yapar, duplicate line oluşmaz.
2. **Fuzzy merge yok**: API'den gelen her satır tek line; quantity toplama yok.
3. **1 local line = 1 API line**: ensureOrderExistsOnApi her local satırı tek tek push eder, client_line_id ile.
4. **Retry güvenli**: Aynı client_line_id ile tekrar add → backend idempotent update.

---

## Why Ready Items No Longer Reappear

1. **Line identity ile eşleme**: `clientLineId` veya `apiId` ile doğru satır bulunur.
2. **resolveStatusForSync**: Local rank ≥ API rank → local status korunur.
3. **Delete-all yok**: Satırlar yeniden oluşturulmadığı için id/identity kaybı yok.
4. **Upsert**: Mevcut satır update edilir; status local-first kalır.

---

## How to Test

1. **Tek ürün 1x**: Ürün ekle → cart x1. Sync 10x → x1 kalmalı.
2. **Sync quantity**: Aynı masaya yeni ürün ekle → sadece yeni line eklenmeli.
3. **KDS ready**: KDS'te ready yap → sync sonrası geri gelmemeli.
4. **Retry print**: Retry print → sentAt değişmemeli.
5. **Offline/online**: Offline ekle, online sync → quantity ve status bozulmamalı.
6. **Web-added**: Web'den satır ekle → sync sonrası local'de görünmeli.
