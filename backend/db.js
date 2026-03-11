/**
 * @deprecated LowDB/data.json kaldırıldı. Tüm veri PostgreSQL (Prisma) üzerinden.
 *
 * Eski db.js import eden scriptler:
 * - import_product_printer_modifier_from_excel.js
 * - import_modifiers_printers_from_csv.js
 *
 * Bu scriptler için: Web backoffice (pos.the-limon.com) üzerinden
 * Ürün/Kategori/Modifier/Printer yönetimi yapın veya migrate-data.js ile
 * mevcut data.json'ı PostgreSQL'e taşıyın.
 */
throw new Error(
  "db.js (LowDB) kaldırıldı. Veri artık PostgreSQL/Prisma ile. " +
  "Import için: Web backoffice kullanın veya migrate-data.js çalıştırın."
);
