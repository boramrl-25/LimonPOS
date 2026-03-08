# KDS Printer Filter Fix — Özet

## Exact Root Cause

1. **Client race (ana sebep):** `loadKitchen()` başında `updateKdsPrinterSelection()` her zaman çağrılıyordu. Bu fonksiyon DOM’daki `.kds-printer-id.active` butonlarından seçimi okuyor. `showPage('kds')` → `loadKdsPrinters(); loadKitchen();` sırasında `loadKitchen` hemen çalışıyor; o anda printer listesi henüz fetch edilmediği için DOM boş. `updateKdsPrinterSelection` boş DOM’dan `activeIds = []` alıp `kdsSelectedPrinterIds = null` yapıyor. Sonuç: Her zaman "All" modu.
2. **Category fallback eksikliği (server):** Önceki fix’te eklendi; `product.printers` boşsa `category.printers` kullanılıyor.

---

## Files Changed

| File | Change |
|------|--------|
| `KdsServer.kt` | 1) `/kitchen-orders` filtrelemesinde effective printer (product → category fallback). 2) `updateKdsPrinterSelection` sadece printer listesi DOM’da hazır olduğunda çağrılıyor. 3) `loadKdsPrinters` fetch bitince `loadKitchen()` çağrılıyor. |

---

## Selected Printer Storage

- **Yer:** WebView `localStorage` (embedded HTML/JS, `KdsServer.CONTROL_HTML`)
- **Key:** `kds_selected_printers`
- **Değer:** `null` veya `["id1","id2"]` (printer ID)

---

## Final Filtering Code Path

**Client:** `loadKitchen()` → `url = base + '/kitchen-orders'` + (eğer `kdsSelectedPrinterIds` dolu) `?printers=id1,id2`  
**Server:** `KdsServer.serve()` → query `printers` alınır → `selectedPrinterIds` set  
Her item için: `effectivePrinterIds = product.printers` else `category.printers` → `effectivePrinterIds.any { it in selectedPrinterIds }`

---

## Why It Was Still Not Working

`loadKitchen()` her çağrıda `updateKdsPrinterSelection()` ile DOM’dan seçim okuyordu. İlk yüklemede DOM henüz boş (fetch tamamlanmamış) olduğu için `kdsSelectedPrinterIds = null` oluyordu. Bu yüzden her zaman `/kitchen-orders` (parametresiz) çağrılıyor ve “All” davranışı oluşuyordu.

---

## How to Test

1. KDS aç → Bir printer seç (örn. Bar) → Sadece o printer’a atanmış ürünler görünmeli.
2. “All” tıkla → Tüm ürünler görünmeli.
3. Uygulamayı kapat/aç, KDS’e gir → Önceki seçim korunmalı.
4. Üründe printer yok, kategoride varsa → O kategori printer’ı seçiliyken ürün görünmeli.
