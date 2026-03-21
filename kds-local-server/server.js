/**
 * LimonPOS — KDS yerel sunucu (sadece LAN).
 * POS bu servise HTTP ile sipariş snapshot'ı gönderir; KDS ekranları aynı ağdan okur.
 *
 * Ortam:
 *   PORT=3099
 *   KDS_PIN=8030                    — tüm KDS ekranları için ortak PIN
 *   KDS_PUSH_SECRET=paylasilan-gizli — POS'un X-KDS-Secret başlığında göndermesi gerekir
 */
import express from "express";
import cors from "cors";
import crypto from "crypto";

const PORT = Number(process.env.PORT || 3099);
const KDS_PIN = String(process.env.KDS_PIN || "8030");
const KDS_PUSH_SECRET = String(process.env.KDS_PUSH_SECRET || "change-me-in-production");

/** @type {Map<string, { updatedAt: number, payload: object }>} */
const orders = new Map();
/** @type {Map<string, number>} token -> expiry ms */
const sessions = new Map();

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "kds-local", orders: orders.size });
});

function requirePushSecret(req, res, next) {
  const h = req.headers["x-kds-secret"];
  if (!h || h !== KDS_PUSH_SECRET) {
    return res.status(401).json({ error: "invalid_push_secret" });
  }
  next();
}

function requireKdsSession(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const exp = sessions.get(token);
  if (!token || !exp || Date.now() > exp) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}

/** POS: mutfağa giden satırların snapshot'ı */
app.post("/api/kds/orders/push", requirePushSecret, (req, res) => {
  const body = req.body || {};
  const orderId = body.order_id || body.orderId;
  if (!orderId) return res.status(400).json({ error: "order_id required" });
  const payload = {
    order_id: orderId,
    table_number: String(body.table_number ?? body.tableNumber ?? ""),
    waiter_name: String(body.waiter_name ?? body.waiterName ?? ""),
    status: String(body.status ?? "open"),
    created_at: body.created_at ?? body.createdAt ?? Date.now(),
    items: Array.isArray(body.items) ? body.items : [],
    updated_at: Date.now(),
  };
  orders.set(orderId, { updatedAt: Date.now(), payload });
  res.json({ ok: true, order_id: orderId });
});

/** KDS ekranı: PIN ile oturum */
app.post("/api/kds/auth", (req, res) => {
  const pin = String(req.body?.pin ?? "");
  if (pin !== KDS_PIN) {
    return res.status(401).json({ error: "invalid_pin" });
  }
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, Date.now() + 12 * 60 * 60 * 1000);
  res.json({ token, expires_in: 43200 });
});

/** KDS: tüm açık mutfak siparişleri (sent satırları POS zaten filtreleyerek gönderir) */
app.get("/api/kds/orders", requireKdsSession, (_req, res) => {
  const list = [...orders.values()]
    .map((o) => o.payload)
    .sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
  res.json({ orders: list });
});

/** KDS: kalem durumu (hazır / teslim vb.) — POS buluta ayrıca senkronlar */
app.patch("/api/kds/orders/:orderId/items/:itemId/status", requireKdsSession, (req, res) => {
  const { orderId, itemId } = req.params;
  const status = String(req.body?.status ?? "");
  if (!status) return res.status(400).json({ error: "status required" });
  const row = orders.get(orderId);
  if (!row) return res.status(404).json({ error: "order not found" });
  const items = row.payload.items || [];
  const idx = items.findIndex((i) => (i.id || i.item_id) === itemId);
  if (idx < 0) return res.status(404).json({ error: "item not found" });
  items[idx] = { ...items[idx], status };
  row.payload.items = items;
  row.payload.updated_at = Date.now();
  row.updatedAt = Date.now();
  res.json({ ok: true, item: items[idx] });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`KDS local server http://0.0.0.0:${PORT}  PIN=${KDS_PIN}  push_secret=${KDS_PUSH_SECRET === "change-me-in-production" ? "(default — set KDS_PUSH_SECRET)" : "(set)"}`);
});
