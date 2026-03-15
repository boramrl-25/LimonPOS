/**
 * Hibrit mimari: Local Backend Cloud'dan katalog çeker.
 * Local Backend periyodik (cron) çalıştırır.
 * Kullanım: cd backend && API_URL=https://api.the-limon.com/api PIN=1234 node scripts/local-sync-from-cloud.js
 */
import "dotenv/config";
import { prisma } from "../lib/prisma.js";

const API_URL = (process.env.API_URL || "https://api.the-limon.com/api").replace(/\/$/, "");
const PIN = process.env.PIN || "";

async function main() {
  if (!PIN) {
    console.error("PIN gerekli. Örnek: PIN=1234 API_URL=https://api.the-limon.com/api node backend/scripts/local-sync-from-cloud.js");
    process.exit(1);
  }
  const loginRes = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin: PIN }),
  });
  if (!loginRes.ok) {
    console.error("Giriş başarısız:", loginRes.status, await loginRes.text());
    process.exit(1);
  }
  const { token } = await loginRes.json();

  const headers = {
    Authorization: `Bearer ${token}`,
    "X-Source": "local_backend",
  };

  // Kategori
  const categories = await fetch(`${API_URL}/categories`, { headers }).then((r) => r.json());
  for (const c of categories) {
    await prisma.category.upsert({
      where: { id: c.id },
      create: { id: c.id, name: c.name, color: c.color ?? "#84CC16", sort_order: c.sort_order ?? 0, active: c.active ?? 1, modifier_groups: JSON.stringify(c.modifier_groups ?? []), printers: JSON.stringify(c.printers ?? []), show_till: c.show_till ?? 0 },
      update: { name: c.name, color: c.color ?? "#84CC16", sort_order: c.sort_order ?? 0, active: c.active ?? 1, modifier_groups: JSON.stringify(c.modifier_groups ?? []), printers: JSON.stringify(c.printers ?? []), show_till: c.show_till ?? 0 },
    });
  }

  // Ürün
  const products = await fetch(`${API_URL}/products`, { headers }).then((r) => r.json());
  for (const p of products) {
    await prisma.product.upsert({
      where: { id: p.id },
      create: { id: p.id, name: p.name, name_arabic: p.name_arabic ?? "", name_turkish: p.name_turkish ?? "", sku: p.sku, category_id: p.category_id, price: Number(p.price ?? 0), tax_rate: Number(p.tax_rate ?? 0), image_url: p.image_url ?? "", printers: JSON.stringify(p.printers ?? []), modifier_groups: JSON.stringify(p.modifier_groups ?? []), active: p.active ?? 1, pos_enabled: p.pos_enabled ?? 1, zoho_item_id: p.zoho_item_id, sellable: p.sellable ?? true, zoho_suggest_remove: p.zoho_suggest_remove ?? false },
      update: { name: p.name, name_arabic: p.name_arabic ?? "", name_turkish: p.name_turkish ?? "", sku: p.sku, category_id: p.category_id, price: Number(p.price ?? 0), tax_rate: Number(p.tax_rate ?? 0), image_url: p.image_url ?? "", printers: JSON.stringify(p.printers ?? []), modifier_groups: JSON.stringify(p.modifier_groups ?? []), active: p.active ?? 1, pos_enabled: p.pos_enabled ?? 1, zoho_item_id: p.zoho_item_id, sellable: p.sellable ?? true, zoho_suggest_remove: p.zoho_suggest_remove ?? false },
    });
  }

  // Modifier groups, options, payment methods, printers, users - benzer şekilde eklenebilir
  console.log("Local sync OK. Categories:", categories.length, "Products:", products.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
