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
  tables: Array.from({ length: 8 }, (_, i) => ({
    id: `t${i + 1}`,
    number: i + 1,
    name: `Masa ${i + 1}`,
    capacity: 4,
    floor: "main",
    status: "free",
    current_order_id: null,
    guest_count: 0,
    waiter_id: null,
    waiter_name: null,
    opened_at: null,
    x: 100 + (i % 4) * 150,
    y: 50 + Math.floor(i / 4) * 120,
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
};

export const db = await JSONFilePreset(join(__dirname, "data.json"), defaultData);
