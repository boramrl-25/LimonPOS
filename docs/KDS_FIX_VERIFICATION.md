# KDS Fix – Kesin Doğrulama Raporu

## 1. EXACT ROOT CAUSE

**Birincil:** KDS client-side filter sadece `sent` ve `preparing` gösteriyordu; `ready` item’lar görünmüyordu.
```javascript
// ESKİ (hatalı):
items.filter(x => x.status === 'sent' || x.status === 'preparing')
```

**İkincil:** `/kitchen-orders` payload’ında `deliveredAt` yoktu; teslim edilen item’lar client tarafında ayırt edilemiyordu.

**Üçüncül:** `showPage('kds')` bazı senaryolarda `loadKitchen()` çağırıyordu; DOM hazır olmadan erken çağrı riski vardı.

---

## 2. CHANGED FILES

| File | Değişiklikler |
|------|---------------|
| `app/src/main/java/com/limonpos/app/service/KdsServer.kt` | KdsItemDto.deliveredAt; POST `/items/{id}/delivered`; CONTROL_HTML: isVisibleInKds; showPage sadece loadKdsPrinters; loadKitchen sadece fetch/toggle/action sonrası |
| `app/src/main/assets/kds_control.html` | Aynı isVisibleInKds; showPage sadece loadKdsPrinters; loadKitchen akışı |
| `app/src/main/java/com/limonpos/app/data/repository/OrderRepository.kt` | markItemDelivered, markItemReady, markOrderReady debug logları |
| `app/src/main/java/com/limonpos/app/ui/screens/order/OrderScreen.kt` | Satır tıklama = select only; ayrı "✓ Delivered" butonu |

---

## 3. showPage('kds') FINAL CODE

```javascript
function showPage(id) {
  document.querySelectorAll('.panel').forEach(function(p) { p.classList.remove('active'); });
  document.getElementById(id).classList.add('active');
  if (id === 'kds') {
    loadKdsPrinters();   // SADECE loadKdsPrinters
  } else if (id === 'settings') {
    loadReports();
  }
}
```

**loadKitchen nerede çağrılıyor:**
- `loadKdsPrinters` içinde: `fetch(base + '/printers').then(...)` bitince
- `toggleKdsPrinterBtn` sonunda
- Refresh butonu `onclick="loadKitchen()"`
- startItem, readyItem, deliveredItem, orderReady, startAll sonrası
- setInterval (kds panel aktifken her 2 sn)

---

## 4. isVisibleInKds FINAL CODE

```javascript
function isVisibleInKds(it) {
  return (it.status === 'sent' || it.status === 'preparing' || it.status === 'ready') && !it.deliveredAt;
}
```

**Kullanıldığı yerler:**
- item filter: `(o.items || []).filter(isVisibleInKds)`
- counters (pending, preparing, ready, delayed)
- delayed logic: `isLate` içinde `!it.deliveredAt`
- new item detection (kds_control.html allPending)
- checkLateAndShowPopup: `isVisibleInKds(x) && isLate(x)`

---

## 5. /kitchen-orders KdsItemDto FINAL SHAPE

```kotlin
data class KdsItemDto(
    val id: String,
    val productName: String,
    val quantity: Int,
    val notes: String,
    val status: String,
    val sentAt: Long?,
    val deliveredAt: Long? = null   // TESLİM = KDS'DEN DÜŞ
)
```

**Server mapping (KdsServer.kt ~148):**
```kotlin
items.map { KdsItemDto(it.id, it.productName, it.quantity, it.notes, it.status, it.sentAt, it.deliveredAt) }
```

**JSON örneği:**
```json
{
  "id": "...",
  "productName": "...",
  "quantity": 1,
  "notes": "",
  "status": "ready",
  "sentAt": 1234567890,
  "deliveredAt": null
}
```

---

## 6. PRINTER SELECTION FINAL FLOW

1. **localStorage:** `kds_selected_printers` → `["id1","id2"]` veya `null` (All)
2. **loadStoredPrinterSelection():** Sayfa açılışında seçimi okur
3. **loadKdsPrinters():** 
   - Storage’dan seçim okunur
   - `/printers` fetch → kitchen + kdsEnabled
   - DOM: `kds-printer-list` butonları
   - `loadKitchen()` fetch bitince çağrılır
4. **loadKitchen():**  
   - `?printers=id1,id2` (seçili varsa)
   - `updateKdsPrinterSelection()` DOM’dan aktif butonları alır
5. **Server:** `product.printers` → boşsa `category.printers` ile filtreler

---

## 7. READY / DELIVERED FINAL STATE RULE

| State      | KDS’de | Aksiyon            |
|-----------|--------|--------------------|
| sent      | ✓      | Start → preparing  |
| preparing | ✓      | Ready → ready      |
| ready     | ✓      | Delivered → düşer  |
| delivered | ✗      | deliveredAt set    |
| paid      | ✗      | -                  |
| cancelled | ✗      | -                  |

**Kural:** KDS’de sadece `!deliveredAt` olan item’lar gösterilir. `ready` ≠ `delivered`.

---

## 8. TEST STEPS

1. **showPage('kds'):** KDS açılışında sadece `loadKdsPrinters` çağrılmalı; `loadKitchen` yalnızca printer fetch bitince tetiklenmeli.
2. **Bar seç:** Sadece Bar printer’ına ait ürünler görünmeli.
3. **6’lı ocak seç:** Sadece bu printer’a ait ürünler görünmeli.
4. **ready item:** KDS’de "Ready for service" badge ile görünmeye devam etmeli.
5. **delivered item:** `deliveredAt` set edildikten sonra KDS’den kalkmalı.
6. **orderReady:** Tüm item’lar `ready` olmalı, `delivered` olmamalı.
7. **Refresh:** Printer seçimi korunmalı (localStorage).
8. **Network tab:** `/kitchen-orders?printers=id1,id2` isteği görünmeli.
9. **Response:** Her item için `deliveredAt` alanı olmalı.
