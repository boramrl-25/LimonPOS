# KDS Printer Filter — Kesin Fix Özeti

## 1. Exact Root Cause

1. **Client race:** `showPage('kds')` ve ilk sayfa yüklemesinde `loadKitchen()` hemen çağrılıyordu. Bu anda printer listesi DOM'da henüz yok (fetch tamamlanmamış). `updateKdsPrinterSelection()` DOM'dan okuyunca boş liste alıyor, `kdsSelectedPrinterIds = null` oluyordu → her zaman "All".
2. **İlk yüklemede çift çağrı:** Hem `loadKdsPrinters()` hem `loadKitchen()` aynı anda tetikleniyordu; `loadKitchen` fetch bitmeden çalışıyordu.

---

## 2. Changed Files

| File | Change |
|------|--------|
| `app/src/main/java/com/limonpos/app/service/KdsServer.kt` | • `showPage('kds')` sadece `loadKdsPrinters()` çağırıyor (loadKitchen kaldırıldı). • İlk yüklemede sadece `loadKdsPrinters()` çağrılıyor; loadKitchen yok. • `loadKdsPrinters` fetch bitince `loadKitchen()` çağrılıyor. • `updateKdsPrinterSelection` sadece DOM doluysa çağrılıyor. • Debug: `console.log("KDS selected printers:", ...)`, `console.log("KDS printers loaded:", ...)`, `console.log("KDS request URL:", ...)`. |

---

## 3. Full Final Code Path

```
[Page load / KDS açılış]
  → loadKdsPrinters()
     → kdsSelectedPrinterIds = loadStoredPrinterSelection()  // localStorage
     → fetch /printers
     → [response] kdsKitchenPrinters = kitchen + kdsEnabled filter
     → DOM doldur, seçili butonlar active
     → loadKitchen()

[loadKitchen]
  → container.children.length > 0 ise updateKdsPrinterSelection()
  → url = /kitchen-orders  (+ ?printers=id1,id2  eğer kdsSelectedPrinterIds dolu)
  → fetch(url)
  → orders render

[toggleKdsPrinterBtn(id)]
  → All: tüm printer active kaldır, All active, kdsSelectedPrinterIds=null, save, loadKitchen
  → Printer: All inactive, ilgili btn toggle, activeIds topla, kdsSelectedPrinterIds=..., save, loadKitchen

[Server /kitchen-orders]
  → queryParams["printers"] → selectedPrinterIds
  → Her item: effectivePrinterIds = product.printers ?: category.printers
  → effectivePrinterIds.any { it in selectedPrinterIds }
```

---

## 4. Selected Printer IDs Nerede Saklanıyor

- **Yer:** WebView `localStorage`
- **Key:** `kds_selected_printers`
- **Format:** `null` veya `["id1","id2"]` (JSON array)
- **Okuma:** `loadStoredPrinterSelection()`
- **Yazma:** `savePrinterSelection()`

---

## 5. Neden Daha Önceki Fix Yetmedi

- `showPage('kds')` ve ilk yüklemede hâlâ `loadKitchen()` çağrılıyordu.
- `loadKitchen` DOM hazır olmadan çalışıyordu; `updateKdsPrinterSelection` sadece DOM doluysa çağrılıyor olsa bile, ilk `loadKitchen` fetch tamamlanmadan tetikleniyordu.
- Seçim localStorage'da doğru olsa bile, ilk istek DOM/race nedeniyle yanlış parametreyle gidebiliyordu.
- **Şimdiki fix:** `loadKitchen` yalnızca `loadKdsPrinters` fetch bittikten sonra çağrılıyor; ilk yüklemede `loadKitchen` hiç tetiklenmiyor.

---

## 6. Test Adımları

1. **Bar seç** → Sadece Bar ürünleri gelmeli.
2. **6'lı ocak seç** → Sadece ona ait ürünler gelmeli.
3. **Bar + 6'lı ocak** → İkisinin ürünleri gelmeli.
4. **Kategori fallback** → Üründe printer yok, kategoride varsa, o printer seçiliyken ürün görünmeli.
5. **All** → Tüm ürünler gelmeli.
6. **Uygulama kapat/aç** → Seçim korunmalı (localStorage).
7. **Browser refresh** → Seçim korunmalı.
8. **Network tab** → `/kitchen-orders?printers=id1,id2` görünmeli (printer seçiliyken).
9. **Console** → `KDS selected printers:`, `KDS printers loaded:`, `KDS request URL:` logları görünmeli.
