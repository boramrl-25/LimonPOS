/**
 * 1. "Breakfast extra drink and breads" modifier: min 0, max 99 (unlimited)
 * 2. Adds this modifier as second modifier to all products in BREAKFAST COMBO category
 *
 * Uses Prisma (PostgreSQL) - no LowDB.
 */
import * as store from "../lib/store.js";

async function run() {
  await store.ensurePrismaReady();
  const modifierGroups = await store.getModifierGroups();
  const products = await store.getAllProducts();
  const categories = await store.getAllCategories();

  const mg = modifierGroups.find((m) => (m.name || "").toLowerCase().includes("breakfast extra drink"));
  if (!mg) {
    console.error("Modifier 'Breakfast extra drink and breads' not found.");
    process.exit(1);
  }
  await store.updateModifierGroup(mg.id, { min_select: 0, max_select: 99 });
  console.log("Modifier updated: min=0, max=99:", mg.name);

  const comboCategory = categories.find(
    (c) => (c.name || "").toUpperCase().replace(/\s+/g, " ").trim() === "BREAKFAST COMBO",
  );
  if (!comboCategory) {
    console.error("Category 'BREAKFAST COMBO' not found.");
    process.exit(1);
  }
  const categoryId = comboCategory.id;

  let count = 0;
  for (const p of products) {
    if (p.category_id !== categoryId) continue;
    const arr = JSON.parse(p.modifier_groups || "[]");
    const without = arr.filter((id) => id !== mg.id);
    const at = Math.min(1, without.length);
    without.splice(at, 0, mg.id);
    await store.updateProduct(p.id, { modifier_groups: JSON.stringify(without) });
    count++;
  }

  console.log("Updated products in BREAKFAST COMBO:", count);
  console.log("Done.");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
