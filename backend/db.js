import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { JSONFilePreset } from "lowdb/node";

const __dirname = dirname(fileURLToPath(import.meta.url));
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
    x: 100 + (i % 6) * 140,
    y: 50 + Math.floor(i / 6) * 110,
    width: 120,
    height: 100,
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
};

export const db = await JSONFilePreset(join(__dirname, "data.json"), defaultData);
