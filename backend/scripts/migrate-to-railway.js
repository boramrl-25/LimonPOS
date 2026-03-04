/**
 * Local data.json'daki ürünleri ve kategorileri Railway API'ye gönderir.
 * Kullanım: node scripts/migrate-to-railway.js
 * 
 * API_URL: https://limonpos-production.up.railway.app/api
 * Giriş: PIN 1234
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_URL = process.env.API_URL || "https://api.the-limon.com/api";
const PIN = process.env.MIGRATE_PIN || "1234";

async function login() {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin: PIN }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Login failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  return data.token;
}

async function postCategory(token, cat) {
  const body = {
    id: cat.id,
    name: cat.name,
    color: cat.color || "#84CC16",
    sort_order: cat.sort_order ?? 0,
    active: cat.active !== false && cat.active !== 0,
  };
  const res = await fetch(`${API_URL}/categories`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok && res.status !== 409) {
    console.warn(`Category ${cat.name}: ${res.status}`);
    return false;
  }
  return true;
}

async function postProduct(token, prod) {
  const body = {
    id: prod.id,
    name: prod.name || "Product",
    name_arabic: prod.name_arabic || "",
    name_turkish: prod.name_turkish || "",
    sku: prod.sku || "",
    category_id: prod.category_id || null,
    price: prod.price ?? 0,
    tax_rate: prod.tax_rate ?? 0,
    image_url: prod.image_url || "",
    active: prod.active !== false && prod.active !== 0,
    pos_enabled: prod.pos_enabled !== false && prod.pos_enabled !== 0,
  };
  const res = await fetch(`${API_URL}/products`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok && res.status !== 409) {
    console.warn(`Product ${prod.name}: ${res.status}`);
    return false;
  }
  return true;
}

async function main() {
  const dataPath = join(__dirname, "..", "data.json");
  let data;
  try {
    data = JSON.parse(readFileSync(dataPath, "utf-8"));
  } catch (e) {
    console.error("data.json okunamadı:", e.message);
    process.exit(1);
  }

  const categories = data.categories || [];
  const products = data.products || [];

  if (categories.length === 0 && products.length === 0) {
    console.log("Taşınacak kategori veya ürün yok.");
    process.exit(0);
  }

  console.log(`Railway: ${API_URL}`);
  console.log(`Kategoriler: ${categories.length}, Ürünler: ${products.length}`);

  let token;
  try {
    token = await login();
    console.log("Giriş başarılı.");
  } catch (e) {
    console.error("Giriş hatası:", e.message);
    process.exit(1);
  }

  let catOk = 0;
  let catFail = 0;
  for (const cat of categories) {
    try {
      const ok = await postCategory(token, cat);
      if (ok) catOk++;
      else catFail++;
    } catch (e) {
      catFail++;
      console.warn(`Kategori ${cat.name}: ${e.message}`);
    }
  }
  console.log(`Kategoriler: ${catOk} başarılı, ${catFail} hata`);

  // pos_enabled=0 olanları atlayabilirsin; hepsini göndermek için pos_enabled kontrolünü kaldır
  const toSend = products.filter((p) => p.sellable !== false);
  let prodOk = 0;
  let prodFail = 0;
  for (let i = 0; i < toSend.length; i++) {
    try {
      const ok = await postProduct(token, toSend[i]);
      if (ok) prodOk++;
      else prodFail++;
    } catch (e) {
      prodFail++;
      if (i < 5) console.warn(`Ürün ${toSend[i].name}: ${e.message}`);
    }
    if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${toSend.length} ürün gönderildi...`);
  }
  console.log(`Ürünler: ${prodOk} başarılı, ${prodFail} hata`);
  console.log("Migrasyon tamamlandı.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
