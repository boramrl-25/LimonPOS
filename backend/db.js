import { join, dirname } from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import lock from "proper-lockfile";
import { JSONFilePreset } from "lowdb/node";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Kalıcı veri: Production'da mutlaka DATA_DIR kalıcı bir dizin olmalı (örn. Railway volume /data).
// DATA_DIR yoksa __dirname kullanılır; sunucu/ephemeral disk silinirse tüm veri gider.
const DATA_DIR = process.env.DATA_DIR || __dirname;
if (!process.env.DATA_DIR) {
  console.warn("[db] DATA_DIR tanımlı değil – veriler proje dizininde; Railway/redeploy'da SİLİNİR. Volume + DATA_DIR=/data ekleyin.");
}
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (e) {
    console.error("[db] DATA_DIR oluşturulamadı:", e.message);
  }
}
const DATA_FILE = join(DATA_DIR, "data.json");
const BACKUP_FILE = join(DATA_DIR, "data.json.backup");

const defaultData = {
  users: [{ id: "u1", name: "Admin", pin: "1234", role: "admin", active: 1, permissions: "[\"post_void\",\"pre_void\"]", cash_drawer_permission: 1 }],
  categories: [{ id: "cat1", name: "İçecekler", color: "#84CC16", sort_order: 0, active: 1 }],
  products: [],
  printers: [],
  payment_methods: [
    { id: "pm1", name: "Nakit", code: "cash", active: 1, sort_order: 0 },
    { id: "pm2", name: "Kart", code: "card", active: 1, sort_order: 1 },
  ],
  modifier_groups: [],
  tables: Array.from({ length: 43 }, (_, i) => ({
    id: `main-${i + 1}`,
    number: String(i + 1),
    name: `Table ${i + 1}`,
    capacity: 4,
    floor: "Main",
    status: "free",
    current_order_id: null,
    guest_count: 0,
    waiter_id: null,
    waiter_name: null,
    opened_at: null,
    x: 80 + (i % 10) * 90,
    y: 50 + Math.floor(i / 10) * 100,
    width: 80,
    height: 80,
    shape: "square",
  })),
  orders: [],
  order_items: [],
  payments: [],
  void_logs: [],
  void_requests: [],
  zoho_config: {},
  devices: [],
  setup_complete: false,
  audit_log: [],
};

let db;
let dataFilePath = DATA_FILE;

function wrapWrite(dbInstance, filePath, backupPath) {
  const originalWrite = dbInstance.write.bind(dbInstance);
  dbInstance.write = async function wrappedWrite() {
    const release = await lock(filePath, { retries: { retries: 8, minTimeout: 100, maxTimeout: 2000 }, stale: 30000 });
    try {
      if (fs.existsSync(filePath)) {
        try {
          fs.copyFileSync(filePath, backupPath);
        } catch (backupErr) {
          console.warn("[db] Backup yazılamadı:", backupErr?.message);
        }
      }
      if (dbInstance.data) {
        if (!Array.isArray(dbInstance.data.audit_log)) dbInstance.data.audit_log = [];
        dbInstance.data.audit_log.push({ ts: Date.now(), action: "write" });
        if (dbInstance.data.audit_log.length > 1000) dbInstance.data.audit_log = dbInstance.data.audit_log.slice(-1000);
      }
      await originalWrite();
    } finally {
      await release();
    }
  };
}

try {
  db = await JSONFilePreset(DATA_FILE, defaultData);
  console.log("[db] Veri dosyası:", DATA_FILE);
  wrapWrite(db, DATA_FILE, BACKUP_FILE);
} catch (e) {
  console.error("[db] Birincil veri dosyası açılamadı:", e.message);
  try {
    const fallbackDir = __dirname;
    const fallbackFile = join(fallbackDir, "data.json");
    dataFilePath = fallbackFile;
    console.warn("[db] Yedek konum kullanılıyor:", fallbackFile);
    db = await JSONFilePreset(fallbackFile, defaultData);
    wrapWrite(db, fallbackFile, join(fallbackDir, "data.json.backup"));
  } catch (e2) {
    console.error("[db] Yedek konum da başarısız:", e2.message);
    dataFilePath = null;
    const mem = JSON.parse(JSON.stringify(defaultData));
    db = {
      data: mem,
      read: async () => {},
      write: async () => {},
    };
    console.warn("[db] UYARI: Sadece bellek kullanılıyor – veriler kalıcı değil. Railway'de Volume ekleyip DATA_DIR=/data ve Mount Path=/data yapın.");
  }
}

export { db };

export function getDataFileInfo() {
  if (!dataFilePath) return { path: null, inMemory: true };
  try {
    const st = fs.statSync(dataFilePath);
    return {
      path: dataFilePath,
      inMemory: false,
      size: st.size,
      mtime: st.mtimeMs,
    };
  } catch {
    return { path: dataFilePath, inMemory: false, size: null, mtime: null };
  }
}
