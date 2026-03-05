/**
 * 1. "Breakfast extra drink and breads" modifier: min 0, max sınırsız (99)
 * 2. BREAKFAST COMBO kategorisindeki tüm ürünlere bu modifier'ı ikinci modifier olarak ekle
 */
import { db } from "../db.js";

async function run() {
  await db.read();
  db.data.products = db.data.products || [];
  db.data.categories = db.data.categories || [];
  db.data.modifier_groups = db.data.modifier_groups || [];

  const mg = db.data.modifier_groups.find(
    (m) => (m.name || "").toLowerCase().includes("breakfast extra drink")
  );
  if (!mg) {
    console.error("Modifier 'Breakfast extra drink and breads' bulunamadı.");
    process.exit(1);
  }
  mg.min_select = 0;
  mg.max_select = 99;
  console.log("Modifier güncellendi: min=0, max=99 (sınırsız):", mg.name);

  const comboCategory = db.data.categories.find(
    (c) => (c.name || "").toUpperCase().replace(/\s+/g, " ").trim() === "BREAKFAST COMBO"
  );
  if (!comboCategory) {
    console.error("Kategori 'BREAKFAST COMBO' bulunamadı.");
    process.exit(1);
  }
  const categoryId = comboCategory.id;

  let count = 0;
  for (const p of db.data.products) {
    if (p.category_id !== categoryId) continue;
    const arr = JSON.parse(p.modifier_groups || "[]");
    const without = arr.filter((id) => id !== mg.id);
    const at = Math.min(1, without.length);
    without.splice(at, 0, mg.id);
    p.modifier_groups = JSON.stringify(without);
    count++;
  }

  await db.write();
  console.log("BREAKFAST COMBO kategorisindeki ürün sayısı (güncellenen):", count);
  console.log("Bitti.");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
