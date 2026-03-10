/**
 * pos.the-limon.com (api.the-limon.com) verilerini indirip data.json oluşturur.
 * Kullanım: API_URL=https://api.the-limon.com/api PIN=1234 node backend/scripts/fetch-from-api.js
 */
const API_URL = (process.env.API_URL || "https://api.the-limon.com/api").replace(/\/$/, "");
const PIN = process.env.PIN || "";
const OUT_FILE = process.env.OUT_FILE || "data.json";

async function main() {
  if (!PIN) {
    console.error("PIN gerekli. Örnek: PIN=1234 node backend/scripts/fetch-from-api.js");
    process.exit(1);
  }
  console.log("Giriş yapılıyor...");
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
  console.log("Export indiriliyor...");
  const exportRes = await fetch(`${API_URL}/export`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!exportRes.ok) {
    console.error("Export başarısız:", exportRes.status, await exportRes.text());
    process.exit(1);
  }
  const data = await exportRes.json();
  const fs = await import("fs");
  const path = await import("path");
  const outPath = path.join(process.cwd(), OUT_FILE);
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2), "utf-8");
  console.log("Kaydedildi:", outPath);
  console.log("  Users:", data.users?.length ?? 0);
  console.log("  Products:", data.products?.length ?? 0);
  console.log("  Tables:", data.tables?.length ?? 0);
  console.log("  Orders:", data.orders?.length ?? 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
