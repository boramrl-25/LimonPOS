/**
 * Local data.json'daki kullanıcıları, printer'ları, kategorileri, ürünleri production API'ye gönderir.
 * Kullanım: cd backend && node scripts/migrate-to-railway.js
 *
 * Taşınan: users, printers, modifier_groups, categories, products
 * Gerekli: backend/data.json (local veri)
 * API_URL: https://api.the-limon.com/api
 * Giriş: PIN 1234 (MIGRATE_PIN ile değiştirilebilir)
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_URL = process.env.API_URL || "https://api.the-limon.com/api";
const PIN = process.env.MIGRATE_PIN || "1234";

function parseJson(val, def) {
  if (val === undefined || val === null) return def;
  if (typeof val === "string") {
    try {
      return JSON.parse(val);
    } catch {
      return def;
    }
  }
  return Array.isArray(val) ? val : def;
}

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

async function postUser(token, u) {
  const body = {
    id: u.id,
    name: u.name || "User",
    pin: String(u.pin || "0000"),
    role: u.role || "waiter",
    active: u.active !== false && u.active !== 0 ? true : false,
    permissions: parseJson(u.permissions, []),
    cash_drawer_permission: !!(u.cash_drawer_permission || u.cash_drawer_permission === 1),
  };
  const res = await fetch(`${API_URL}/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.warn(`User ${u.name}: ${res.status}`);
    return false;
  }
  return true;
}

async function postCategory(token, cat) {
  const body = {
    id: cat.id,
    name: cat.name,
    color: cat.color || "#84CC16",
    sort_order: cat.sort_order ?? 0,
    active: cat.active !== false && cat.active !== 0,
    modifier_groups: parseJson(cat.modifier_groups, []),
    printers: parseJson(cat.printers, []),
  };
  const res = await fetch(`${API_URL}/categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
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
    printers: parseJson(prod.printers, []),
    modifier_groups: parseJson(prod.modifier_groups, []),
  };
  const res = await fetch(`${API_URL}/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok && res.status !== 409) {
    console.warn(`Product ${prod.name}: ${res.status}`);
    return false;
  }
  return true;
}

async function postModifierGroup(token, mg) {
  const options = parseJson(mg.options, []);
  const body = {
    id: mg.id,
    name: mg.name || "Modifier Group",
    min_select: mg.min_select ?? 0,
    max_select: mg.max_select ?? 1,
    required: !!(mg.required || mg.required === 1),
    options: Array.isArray(options) ? options : [],
  };
  const res = await fetch(`${API_URL}/modifier-groups`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok && res.status !== 409) {
    console.warn(`Modifier group ${mg.name}: ${res.status}`);
    return false;
  }
  return true;
}

async function postPrinter(token, pr) {
  const body = {
    id: pr.id,
    name: pr.name || "Printer",
    printer_type: pr.printer_type || "kitchen",
    ip_address: pr.ip_address || "",
    port: pr.port ?? 9100,
    connection_type: pr.connection_type || "network",
    status: pr.status || "offline",
    is_backup: !!(pr.is_backup || pr.is_backup === 1),
    kds_enabled: pr.kds_enabled !== false && pr.kds_enabled !== 0,
  };
  const res = await fetch(`${API_URL}/printers`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok && res.status !== 409) {
    console.warn(`Printer ${pr.name}: ${res.status}`);
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
    console.error("data.json okunamadı. backend/data.json dosyası var mı?", e.message);
    process.exit(1);
  }

  const users = data.users || [];
  const modifierGroups = data.modifier_groups || [];
  const printers = data.printers || [];
  const categories = data.categories || [];
  const products = data.products || [];

  const total = users.length + modifierGroups.length + printers.length + categories.length + products.filter((p) => p.sellable !== false).length;
  if (total === 0) {
    console.log("Taşınacak veri yok (users, categories, products, modifier_groups, printers).");
    process.exit(0);
  }

  console.log(`Hedef: ${API_URL}`);
  console.log(`Users: ${users.length}, Modifier groups: ${modifierGroups.length}, Printers: ${printers.length}, Categories: ${categories.length}, Products: ${products.filter((p) => p.sellable !== false).length}`);

  let token;
  try {
    token = await login();
    console.log("Giriş başarılı.\n");
  } catch (e) {
    console.error("Giriş hatası:", e.message);
    process.exit(1);
  }

  let ok = 0,
    fail = 0;
  for (const u of users) {
    const r = await postUser(token, u);
    if (r) ok++;
    else fail++;
  }
  if (users.length) console.log(`Users: ${ok} ok, ${fail} fail`);

  ok = 0;
  fail = 0;
  for (const mg of modifierGroups) {
    const r = await postModifierGroup(token, mg);
    if (r) ok++;
    else fail++;
  }
  if (modifierGroups.length) console.log(`Modifier groups: ${ok} ok, ${fail} fail`);

  ok = 0;
  fail = 0;
  for (const pr of printers) {
    const r = await postPrinter(token, pr);
    if (r) ok++;
    else fail++;
  }
  if (printers.length) console.log(`Printers: ${ok} ok, ${fail} fail`);

  ok = 0;
  fail = 0;
  for (const cat of categories) {
    const r = await postCategory(token, cat);
    if (r) ok++;
    else fail++;
  }
  if (categories.length) console.log(`Categories: ${ok} ok, ${fail} fail`);

  const toSend = products.filter((p) => p.sellable !== false);
  ok = 0;
  fail = 0;
  for (let i = 0; i < toSend.length; i++) {
    const r = await postProduct(token, toSend[i]);
    if (r) ok++;
    else fail++;
    if ((i + 1) % 50 === 0) console.log(`  Products ${i + 1}/${toSend.length}...`);
  }
  if (toSend.length) console.log(`Products: ${ok} ok, ${fail} fail`);

  console.log("\nMigrasyon tamamlandı.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
