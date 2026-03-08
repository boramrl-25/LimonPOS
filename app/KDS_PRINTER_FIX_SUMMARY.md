# KDS Printer Filter Fix — Özet

## Root Cause

**KDS filtering sadece `ProductEntity.printers` kullanıyordu; `CategoryEntity.printers` fallback yoktu.**

`KitchenPrintHelper` ürünün printer bilgisini `product.printers` varsa ondan, yoksa `category.printers`’ten alıyordu. KDS tarafında ise sadece `product.printers` kullanıldığı için:

- Ürünün kendisinde printer yok ama kategoride varsa → bu ürünler KDS filtresinde görünmüyordu
- Bar / 6’lı ocak gibi kategori bazlı printer atamaları çalışmıyordu

---

## Files Changed

| File | Change |
|------|--------|
| `app/src/main/java/com/limonpos/app/service/KdsServer.kt` | `/kitchen-orders` filtrelemesinde `effective printer` mantığı: `product.printers` boşsa `category.printers` kullanılıyor. `PrinterService.parsePrinterIds` ile tutarlı parsing. |

---

## Selected Printer Storage

- **Yer:** WebView `localStorage` (KDS HTML/JS embedded in `KdsServer.CONTROL_HTML`)
- **Key:** `kds_selected_printers`
- **Değer:** `null` veya `["id1","id2"]` (printer ID listesi)
- **Davranış:**
  - `null` / boş → “All” modu, tüm ürünler gösterilir
  - Dolu → Sadece seçili printer’lara ait ürünler gösterilir

---

## Final Visibility Rule

**Item görünsün mü?**

```
effectivePrinterIds = product.printers (parse) 
  → eğer boş: category.printers (parse)
  → eğer yine boş: []

IF selectedPrinterIds == null (All modu):
  → Tüm itemler göster
ELSE (belirli printer(lar) seçili):
  → Sadece effectivePrinterIds ∩ selectedPrinterIds ≠ ∅ olan itemler göster
  → effectivePrinterIds boş olan itemler (ne product ne category) GÖSTERME
```

---

## Test Steps

1. **Sadece Bar printer seçili KDS**
   - Bar’a atanmış ürünler görünmeli
   - Sadece başka printer’lara atanmış ürünler görünmemeli

2. **Sadece 6’lı ocak printer seçili KDS**
   - 6’lı ocak ürünleri görünmeli

3. **Bar + 6’lı ocak seçili KDS**
   - Bar veya 6’lı ocak printer’larına atanmış tüm ürünler görünmeli

4. **Kategori fallback**
   - Üründe `printers: []`, kategoride `printers: ["pr1"]` ise → KDS’te pr1 seçiliyken bu ürün görünmeli

5. **All modu**
   - Hiç printer seçilmediğinde veya “All” seçildiğinde tüm ürünler görünmeli

6. **Persistence**
   - Uygulamayı kapatıp aç, KDS ekranına gir → Seçim korunmalı (localStorage)
