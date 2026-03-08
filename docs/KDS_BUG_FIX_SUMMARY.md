# KDS Bug Fix Summary

## 1. EXACT ROOT CAUSE

**Primary root cause:** KDS client-side JavaScript filtered items with:
```javascript
items.filter(x => x.status === 'sent' || x.status === 'preparing')
```
`ready` items were excluded, so they disappeared from KDS when marked ready.

**Secondary cause:** Masa tarafında ürün satırına tıklanınca `markItemDelivered` direkt tetikleniyordu; tıklama sadece detay açmalıydı, delivered ayrı butonla olmalıydı.

**Code paths:**
- `KdsServer.kt` CONTROL_HTML & `kds_control.html`: `loadKitchen()` → `items.filter(...)` (line ~616 / ~266)
- `OrderScreen.kt` CartBottomSheet: `onItemClick` → `viewModel.markItemDelivered(item.id)`

---

## 2. HANGI CLICK ACTION KDS ITEM'I KAYBETTIRIYORDU

1. **KDS tarafında:** "✓ Ready" veya "✓ Order Ready" → `markItemReady` / `markOrderReady` → item status `ready` → KDS filter `ready` göstermiyordu → item kayboldu.
2. **Masa tarafında:** Garson ürün satırına tıklayınca `markItemDelivered` çağrılıyordu → `deliveredAt` set edildi. Eski filtrede zaten `ready` yoktu; `deliveredAt` set edilen item'lar da KDS'de gösterilmiyordu (delivered item'lar zaten düşmeli, bu doğru davranış).

---

## 3. STATE MACHINE ESKİ HALİ

| State    | KDS'de görünür | Masa click davranışı       |
|----------|-----------------|----------------------------|
| sent     | ✓               | Click → markItemDelivered  |
| preparing| ✓               | Click → markItemDelivered  |
| ready    | ✗ (YANLIŞ)      | Click → markItemDelivered  |
| delivered| ✗               | -                          |

`ready` KDS'de hiç gösterilmiyordu.

---

## 4. STATE MACHINE YENİ HALİ

| State    | KDS'de görünür | KDS aksiyonları              | Masa aksiyonları          |
|----------|-----------------|------------------------------|---------------------------|
| sent     | ✓               | Start → preparing            | Click: noop; "✓ Delivered" butonu |
| preparing| ✓               | Ready → ready                | Click: noop; "✓ Delivered" butonu |
| ready    | ✓ (badge ile)   | Delivered → KDS'den düşer    | Click: noop; "✓ Delivered" butonu |
| delivered| ✗               | -                            | -                         |
| paid/cancelled | ✗         | -                            | -                         |

---

## 5. CHANGED FILES

| File | Changes |
|------|---------|
| `app/src/main/java/com/limonpos/app/service/KdsServer.kt` | KdsItemDto'ya `deliveredAt`; POST `/kitchen-orders/items/{id}/delivered`; `isVisibleInKds()`; filter: sent/preparing/ready && !deliveredAt; ready UI/badge; `deliveredItem()` |
| `app/src/main/assets/kds_control.html` | Aynı KDS filter, ready count, ready tag, Delivered butonu, `isVisibleInKds`, `deliveredItem` |
| `app/src/main/java/com/limonpos/app/ui/screens/order/OrderScreen.kt` | `onItemClick` artık status değiştirmiyor; `onMarkDelivered` callback ve "✓ Delivered" butonu eklendi |
| `app/src/main/java/com/limonpos/app/data/repository/OrderRepository.kt` | markItemPreparing, markItemReady, markOrderReady, markItemDelivered için geçici Log.d (source, oldStatus, newStatus) |

---

## 6. FINAL KDS VISIBILITY RULE

```
KDS'de göster: (status === 'sent' || status === 'preparing' || status === 'ready') && !deliveredAt
KDS'de gösterme: deliveredAt != null || status === 'paid' || status === 'cancelled'
```

---

## 7. FINAL TABLE/WAITER CLICK RULE

- **Satır tıklama:** Sadece detay/select; status değişmez.
- **"✓ Delivered" butonu:** Explicit olarak teslim edildi işaretlenir → `markItemDelivered` → `deliveredAt` set → KDS'den düşer.

---

## 8. TEST STEPS

1. **item sent → KDS'de görünmeli** – Gönderilen sipariş KDS'de görünür.
2. **Start → preparing → KDS'de görünmeli** – Hazırlanan item görünür kalır.
3. **Ready → KDS'de HALA görünmeli** – "Ready for service" badge ile yeşil vurgu.
4. **Masa ekranında item satırına normal tıklama → KDS değişmemeli** – Tıklama status değiştirmez.
5. **Explicit delivered action → item KDS'den kalkmalı** – KDS "✓ Delivered" veya masa "✓ Delivered" ile.
6. **Order içindeki bir item delivered → diğer item'lar kaybolmamalı** – Sadece o item düşer.
7. **orderReady kullanılırsa** – Tüm item'lar `ready` olur; `delivered` olmaz; KDS'de görünür kalırlar.
8. **Refresh sonrası** – Görünürlük bozulmamalı.
9. **Printer filter açıkken** – Aynı lifecycle korunmalı.
