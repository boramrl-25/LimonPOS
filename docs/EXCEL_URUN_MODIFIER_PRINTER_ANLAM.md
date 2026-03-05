# Excel Dosyalarının Anlamı ve Web’e Aktarım

## 1. MODIFER.xlsx — Modifier grupları ve seçenekleri

**Ne işe yarar:** İçecek/yiyecek için “nasıl olsun?” seçeneklerini (modifier grupları) tanımlar.

**Yapı:**
- **Grup adı** (örn. BAR 1, BAR 2, COOK, Breakfast COMBO 2): Bir modifier grubunun adı.
- **OPTION 1, OPTION 2, …**: O grubun seçenekleri (ör. “NO SUGAR”, “MEDIUM SUGAR”, “WELLDONE”, “Menemen”).
- **Fiyat:** Seçenek fiyatı (0 = ekstra ücret yok).
- **MIN / MAX:** Bazı gruplarda “en az / en fazla kaç seçenek seçilsin” (örn. Breakfast COMBO 2 → min 2, max 2).

**Örnek:**
| Grup      | Seçenekler                          | Min | Max |
|-----------|-------------------------------------|-----|-----|
| BAR 1     | NO SUGAR, MEDIUM SUGAR, SUGAR       | 0   | 1   |
| BAR 2     | ICE, NO ICE                         | 0   | 1   |
| COOK      | WELLDONE, MEDIUM WELL, MEDIUM, …    | 0   | 1   |
| Breakfast COMBO 2 | Menemen, Fried egg, Omlette | 2   | 2   |

**Web’e aktarım:** Bu dosya → Backend’de **Modifier Groups** (modifier grupları) ve her grubun **options** (seçenekleri) olarak kaydedilir. POS’ta ürün seçilince bu gruplar “Nasıl olsun?” ekranında gösterilir.

---

## 2. PRODUCT PRINTER AND MODIFER.xlsx — Ürün → yazıcı, modifier, kategori

**Ne işe yarar:** Hangi ürünün hangi yazıcıya gideceğini, hangi modifier gruplarının açılacağını ve hangi kategoride olduğunu tanımlar.

**Sütunlar (kısaca):**
| Sütun   | Anlam |
|--------|--------|
| 1 (ürün adı) | Ürün adı (POS’taki isimle aynı olmalı). |
| Modifier 1   | Bu ürüne bağlanacak 1. modifier grubu (MODIFER.xlsx’teki grup adı). |
| Modifier 2   | 2. modifier grubu (opsiyonel). |
| printer (x4) | Bu ürün siparişe eklenince hangi yazıcılara fiş gidecek (4 sütun = 4 farklı yazıcı alanı). |
| category     | Ürünün kategorisi (örn. BREAKFAST, COFFEE & TEA, CHARCOAL GRILL). |

**Örnek satır:**
- **Menemen** → Modifier yok, yazıcı: **6'li ocak**, kategori: **BREAKFAST**.
- **Sultan Breakfast 2 person** → Modifier: **Breakfast COMBO 2**, yazıcılar: **6'li ocak**, **Grill 2**, **Meze-salata**, **Bar**, kategori: **BREAKFAST COMBO**.
- **Turkish Coffe** → Modifier: **BAR** (şeker seçimi), yazıcı: **Bar**, kategori: **COFFEE & TEA**.

**Web’e aktarım:** Bu dosya → Backend’deki **products** kayıtları güncellenir: her ürün için `printers`, `modifier_groups` ve `category_id` bu Excel’e göre set edilir. Ürün adı eşleşmeyen satırlar atlanır.

---

## 3. Web’e nasıl aktarılır?

Backend’de tek komutla her iki Excel’i okuyup DB’ye yazan script çalıştırılır:

```bash
cd backend
node import_product_printer_modifier_from_excel.js "C:\Users\Dell\Desktop\MODIFER.xlsx" "C:\Users\Dell\Desktop\PRODUCT PRINTER AND MODIFER.xlsx"
```

- Önce **MODIFER.xlsx** okunur → modifier grupları ve seçenekleri oluşturulur/güncellenir.
- Sonra **PRODUCT PRINTER AND MODIFER.xlsx** okunur → ürünlerin yazıcı, modifier ve kategori alanları güncellenir.
- Yazıcı adları (6'li ocak, Grill 2, Meze-salata, Bar, Gril) sistemde yoksa otomatik eklenir; ürün ve kategori isimleri mevcut kayıtlarla eşleştirilir.

Bu sayede hem modifier listesi hem ürün–yazıcı–modifier–kategori eşleşmeleri web/POS tarafında kullanılır hale gelir.
