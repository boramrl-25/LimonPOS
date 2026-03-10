/**
 * data.json → PostgreSQL migration (one-time)
 * Usage: DATABASE_URL=postgresql://... node backend/scripts/migrate-data.js
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuid } from "uuid";
import { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "../data.json");

function ts(ms) {
  if (ms == null || ms === "") return null;
  const n = Number(ms);
  if (isNaN(n)) return null;
  return new Date(n);
}

function parseIntSafe(val, def = 0) {
  const n = parseInt(val, 10);
  return isNaN(n) ? def : n;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }
  if (!fs.existsSync(DATA_FILE)) {
    console.error("data.json not found:", DATA_FILE);
    console.error("Lütfen data.json dosyasını sunucuya yükleyin: scp backend/data.json root@SUNUCU_IP:~/LimonPOS/backend/");
    process.exit(1);
  }
  const stat = fs.statSync(DATA_FILE);
  if (!stat.isFile()) {
    console.error("HATA: data.json bir dizin olarak var. Silip tekrar deneyin:");
    console.error("  rm -rf backend/data.json");
    console.error("Sonra data.json dosyasını yükleyin.");
    process.exit(1);
  }

  const raw = fs.readFileSync(DATA_FILE, "utf-8");
  const data = JSON.parse(raw);
  const prisma = new PrismaClient();

  console.log("Migrating data.json → PostgreSQL...");

  try {
    // 1. Users
    const users = data.users || [];
    for (const u of users) {
      await prisma.user.upsert({
        where: { id: u.id },
        create: {
          id: u.id,
          name: String(u.name || "User"),
          pin: String(u.pin || "0000"),
          role: String(u.role || "waiter"),
          active: u.active !== 0 ? 1 : 0,
          permissions: typeof u.permissions === "string" ? u.permissions : JSON.stringify(u.permissions || []),
          cash_drawer_permission: u.cash_drawer_permission ? 1 : 0,
        },
        update: { name: u.name, pin: u.pin, role: u.role, active: u.active !== 0 ? 1 : 0, permissions: typeof u.permissions === "string" ? u.permissions : JSON.stringify(u.permissions || []), cash_drawer_permission: u.cash_drawer_permission ? 1 : 0 },
      });
    }
    console.log("  Users:", users.length);

    // 2. Categories
    const categories = data.categories || [];
    for (const c of categories) {
      await prisma.category.upsert({
        where: { id: c.id },
        create: { id: c.id, name: c.name, color: c.color || "#84CC16", sort_order: parseIntSafe(c.sort_order), active: c.active !== 0 ? 1 : 0, modifier_groups: typeof c.modifier_groups === "string" ? c.modifier_groups : JSON.stringify(c.modifier_groups || []), printers: typeof c.printers === "string" ? c.printers : JSON.stringify(c.printers || []), show_till: parseIntSafe(c.show_till) },
        update: { name: c.name, color: c.color, sort_order: parseIntSafe(c.sort_order), active: c.active !== 0 ? 1 : 0, modifier_groups: typeof c.modifier_groups === "string" ? c.modifier_groups : JSON.stringify(c.modifier_groups || []), printers: typeof c.printers === "string" ? c.printers : JSON.stringify(c.printers || []), show_till: parseIntSafe(c.show_till) },
      });
    }
    console.log("  Categories:", categories.length);

    // 3. Printers
    const printers = data.printers || [];
    for (const p of printers) {
      await prisma.printer.upsert({
        where: { id: p.id },
        create: { id: p.id, name: p.name, printer_type: p.printer_type || "kitchen", ip_address: p.ip_address || null, port: p.port ?? 9100, connection_type: p.connection_type || "network", status: p.status || "offline", is_backup: p.is_backup ? 1 : 0, kds_enabled: p.kds_enabled ? 1 : 0 },
        update: { name: p.name, printer_type: p.printer_type, ip_address: p.ip_address, port: p.port, connection_type: p.connection_type, status: p.status },
      });
    }
    console.log("  Printers:", printers.length);

    // 4. PaymentMethods
    const pms = data.payment_methods || [];
    for (const pm of pms) {
      await prisma.paymentMethod.upsert({
        where: { id: pm.id },
        create: { id: pm.id, name: pm.name, code: pm.code || "other", active: pm.active !== 0 ? 1 : 0, sort_order: parseIntSafe(pm.sort_order) },
        update: { name: pm.name, code: pm.code, active: pm.active !== 0 ? 1 : 0, sort_order: parseIntSafe(pm.sort_order) },
      });
    }
    console.log("  PaymentMethods:", pms.length);

    // 5. ModifierGroups
    const mgs = data.modifier_groups || [];
    for (const mg of mgs) {
      await prisma.modifierGroup.upsert({
        where: { id: mg.id },
        create: { id: mg.id, name: mg.name, min_select: parseIntSafe(mg.min_select), max_select: parseIntSafe(mg.max_select, 1), required: mg.required ? 1 : 0, options: typeof mg.options === "string" ? mg.options : JSON.stringify(mg.options || []) },
        update: { name: mg.name, min_select: parseIntSafe(mg.min_select), max_select: parseIntSafe(mg.max_select), required: mg.required ? 1 : 0, options: typeof mg.options === "string" ? mg.options : JSON.stringify(mg.options || []) },
      });
    }
    console.log("  ModifierGroups:", mgs.length);

    // 6. Products
    const products = data.products || [];
    for (const p of products) {
      await prisma.product.upsert({
        where: { id: p.id },
        create: {
          id: p.id,
          name: p.name || "Product",
          name_arabic: p.name_arabic || "",
          name_turkish: p.name_turkish || "",
          sku: p.sku || null,
          category_id: p.category_id || null,
          price: parseFloat(p.price) || 0,
          tax_rate: parseFloat(p.tax_rate) || 0,
          image_url: p.image_url || "",
          printers: typeof p.printers === "string" ? p.printers : JSON.stringify(p.printers || []),
          modifier_groups: typeof p.modifier_groups === "string" ? p.modifier_groups : JSON.stringify(p.modifier_groups || []),
          active: p.active !== 0 ? 1 : 0,
          pos_enabled: p.pos_enabled === 1 ? 1 : 0,
          zoho_item_id: p.zoho_item_id || null,
          sellable: p.sellable !== false,
          zoho_suggest_remove: !!p.zoho_suggest_remove,
        },
        update: { name: p.name, category_id: p.category_id, price: parseFloat(p.price), printers: typeof p.printers === "string" ? p.printers : JSON.stringify(p.printers || []), modifier_groups: typeof p.modifier_groups === "string" ? p.modifier_groups : JSON.stringify(p.modifier_groups || []), active: p.active !== 0 ? 1 : 0, pos_enabled: p.pos_enabled === 1 ? 1 : 0 },
      });
    }
    console.log("  Products:", products.length);

    // 7. Tables (current_order_id=null - Orders henüz yok, FK hatası önlenir)
    const tables = data.tables || [];
    for (const t of tables) {
      const num = typeof t.number === "number" ? t.number : parseIntSafe(t.number, 1);
      await prisma.table.upsert({
        where: { id: t.id },
        create: {
          id: t.id,
          number: num,
          name: t.name || `Table ${num}`,
          capacity: parseIntSafe(t.capacity, 4),
          floor: t.floor || "Main",
          status: t.status || "free",
          current_order_id: null, // Orders sonra migrate edilecek
          guest_count: parseIntSafe(t.guest_count),
          waiter_id: t.waiter_id || null,
          waiter_name: t.waiter_name || null,
          opened_at: ts(t.opened_at),
          x: parseIntSafe(t.x, 80),
          y: parseIntSafe(t.y, 50),
          width: parseIntSafe(t.width, 80),
          height: parseIntSafe(t.height, 80),
          shape: t.shape || "square",
        },
        update: { number: num, name: t.name, status: t.status, guest_count: parseIntSafe(t.guest_count), waiter_id: t.waiter_id || null, waiter_name: t.waiter_name || null, opened_at: ts(t.opened_at) },
      });
    }
    console.log("  Tables:", tables.length);

    // 7b. Eksik masaları oluştur (Orders'daki table_id referansları için)
    const orders = data.orders || [];
    const tableIds = new Set(tables.map((t) => t.id));
    let extraTables = 0;
    for (const o of orders) {
      const tid = o.table_id;
      if (tid && !tableIds.has(tid)) {
        await prisma.table.upsert({
          where: { id: tid },
          create: {
            id: tid,
            number: 999,
            name: `Masa ${tid}`,
            floor: "Main",
            status: "free",
            current_order_id: null,
          },
          update: {},
        });
        tableIds.add(tid);
        extraTables++;
      }
    }
    if (extraTables) console.log("  Eksik masalar oluşturuldu:", extraTables);

    // 8. Orders
    const userIds = new Set(users.map((u) => u.id));
    for (const o of orders) {
      const waiterId = o.waiter_id && userIds.has(o.waiter_id) ? o.waiter_id : null;
      await prisma.order.upsert({
        where: { id: o.id },
        create: {
          id: o.id,
          table_id: o.table_id,
          table_number: String(o.table_number || ""),
          waiter_id: waiterId,
          waiter_name: o.waiter_name || null,
          status: o.status || "open",
          subtotal: parseFloat(o.subtotal) || 0,
          tax_amount: parseFloat(o.tax_amount) || 0,
          discount_percent: parseFloat(o.discount_percent) || 0,
          discount_amount: parseFloat(o.discount_amount) || 0,
          total: parseFloat(o.total) || 0,
          created_at: ts(o.created_at),
          paid_at: ts(o.paid_at),
          zoho_receipt_id: o.zoho_receipt_id || null,
        },
        update: { status: o.status, total: parseFloat(o.total), paid_at: ts(o.paid_at), zoho_receipt_id: o.zoho_receipt_id },
      });
    }
    console.log("  Orders:", orders.length);

    // 8b. Tables - current_order_id güncelle (Orders artık mevcut)
    const orderIds = new Set(orders.map((o) => o.id));
    for (const t of tables) {
      if (t.current_order_id && orderIds.has(t.current_order_id)) {
        await prisma.table.update({
          where: { id: t.id },
          data: { current_order_id: t.current_order_id },
        });
      }
    }
    console.log("  Tables current_order_id güncellendi");

    // 9. OrderItems
    const orderItems = data.order_items || [];
    const productIds = new Set((data.products || []).map((p) => p.id));
    for (const oi of orderItems) {
      let pid = oi.product_id || "unknown";
      if (!productIds.has(pid)) {
        await prisma.product.upsert({
          where: { id: pid },
          create: { id: pid, name: oi.product_name || "Ürün", category_id: null, price: parseFloat(oi.price) || 0, printers: "[]", modifier_groups: "[]", active: 1, pos_enabled: 1, sellable: true },
          update: {},
        });
        productIds.add(pid);
      }
      await prisma.orderItem.upsert({
        where: { id: oi.id },
        create: {
          id: oi.id,
          order_id: oi.order_id,
          product_id: pid,
          product_name: oi.product_name || "Item",
          quantity: parseIntSafe(oi.quantity, 1),
          price: parseFloat(oi.price) || 0,
          notes: oi.notes || "",
          status: oi.status || "pending",
          sent_at: ts(oi.sent_at),
          client_line_id: oi.client_line_id || null,
        },
        update: { quantity: oi.quantity, price: oi.price, status: oi.status, sent_at: ts(oi.sent_at) },
      });
    }
    console.log("  OrderItems:", orderItems.length);

    // 10. Payments
    const payments = data.payments || [];
    for (const p of payments) {
      const paymentUserId = p.user_id && userIds.has(p.user_id) ? p.user_id : null;
      await prisma.payment.upsert({
        where: { id: p.id },
        create: {
          id: p.id,
          order_id: p.order_id,
          amount: parseFloat(p.amount) || 0,
          method: p.method || "cash",
          received_amount: p.received_amount != null ? parseFloat(p.received_amount) : null,
          change_amount: p.change_amount != null ? parseFloat(p.change_amount) : 0,
          user_id: paymentUserId,
          created_at: ts(p.created_at),
        },
        update: {},
      });
    }
    console.log("  Payments:", payments.length);

    // 11. VoidLogs
    const voidLogs = data.void_logs || [];
    for (const v of voidLogs) {
      try {
        const voidUserId = v.user_id && userIds.has(v.user_id) ? v.user_id : null;
        await prisma.voidLog.upsert({
          where: { id: v.id },
          create: {
            id: v.id,
            type: v.type || "post_void",
            order_id: v.order_id || null,
            order_item_id: v.order_item_id || null,
            product_name: v.product_name || null,
            quantity: v.quantity ?? 1,
            price: v.price ?? null,
            amount: v.amount ?? null,
            source_table_id: v.source_table_id || null,
            source_table_number: v.source_table_number || null,
            user_id: voidUserId,
            user_name: v.user_name || null,
            details: v.details || null,
            created_at: ts(v.created_at),
          },
          update: {},
        });
      } catch (_) {}
    }
    console.log("  VoidLogs:", voidLogs.length);

    // 12. DiscountRequests (payload as Json)
    const discountReqs = data.discount_requests || [];
    for (const dr of discountReqs) {
      const id = dr.id || uuid();
      try {
        await prisma.discountRequest.upsert({
          where: { id },
          create: { id, payload: dr },
          update: { payload: dr },
        });
      } catch (_) {}
    }
    console.log("  DiscountRequests:", discountReqs.length);

    // 13. Devices
    const devices = data.devices || [];
    for (const d of devices) {
      try {
        await prisma.device.upsert({
          where: { id: d.id },
          create: { id: d.id, payload: d },
          update: { payload: d },
        });
      } catch (_) {}
    }
    console.log("  Devices:", devices.length);

    // 14. Settings
    const settings = data.settings || {};
    await prisma.settings.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        timezone_offset_minutes: settings.timezone_offset_minutes ?? 0,
        overdue_undelivered_minutes: Math.min(1440, Math.max(1, settings.overdue_undelivered_minutes ?? 10)),
        opening_time: settings.opening_time ?? "07:00",
        closing_time: settings.closing_time ?? "01:30",
        open_tables_warning_time: settings.open_tables_warning_time ?? "01:00",
        auto_close_open_tables: !!settings.auto_close_open_tables,
        auto_close_payment_method: settings.auto_close_payment_method ?? "cash",
        grace_minutes: Math.min(60, Math.max(0, settings.grace_minutes ?? 0)),
        warning_enabled: settings.warning_enabled !== false,
        last_warning_shown_for_business_day: settings.last_warning_shown_for_business_day ?? null,
        last_auto_close_for_business_day: settings.last_auto_close_for_business_day ?? null,
        floor_plan_sections: data.floor_plan_sections || null,
        setup_complete: data.setup_complete !== false,
        reconciliation_bank_settings: data.reconciliation_bank_settings || null,
        reconciliation_bank_accounts: data.reconciliation_bank_accounts || null,
        physical_cash_count_by_date: data.physical_cash_count_by_date || null,
        migrations: data.migrations || null,
        business_operation_log: data.business_operation_log || null,
        eod_logs: data.eod_logs || null,
        cash_drawer_opens: data.cash_drawer_opens || null,
        daily_cash_entries: data.daily_cash_entries || null,
        custom_roles: data.custom_roles || null,
        reconciliation_imports: data.reconciliation_imports || null,
        reconciliation_inbox_config: data.reconciliation_inbox_config ?? null,
        reconciliation_warnings: data.reconciliation_warnings || null,
        company_name: settings.company_name ?? "",
        company_address: settings.company_address ?? "",
        receipt_header: settings.receipt_header ?? "BILL / RECEIPT",
        receipt_footer_message: settings.receipt_footer_message ?? "Thank you!",
        kitchen_header: settings.kitchen_header ?? "KITCHEN",
        receipt_item_size: parseIntSafe(settings.receipt_item_size),
        currency_code: settings.currency_code ?? "AED",
        vat_percent: parseIntSafe(settings.vat_percent),
      },
      update: {
        timezone_offset_minutes: settings.timezone_offset_minutes ?? 0,
        overdue_undelivered_minutes: Math.min(1440, Math.max(1, settings.overdue_undelivered_minutes ?? 10)),
        opening_time: settings.opening_time ?? "07:00",
        closing_time: settings.closing_time ?? "01:30",
        floor_plan_sections: data.floor_plan_sections || undefined,
        setup_complete: data.setup_complete !== false,
        reconciliation_bank_settings: data.reconciliation_bank_settings ?? undefined,
        reconciliation_bank_accounts: data.reconciliation_bank_accounts ?? undefined,
      },
    });
    console.log("  Settings: OK");

    // 14b. floor_plan_sections'taki masa numaralarından eksik masaları oluştur
    const floorSections = data.floor_plan_sections || {};
    const allTableNumbers = new Set();
    for (const key of Object.keys(floorSections)) {
      const arr = floorSections[key];
      if (Array.isArray(arr)) for (const n of arr) allTableNumbers.add(parseInt(n, 10));
    }
    const existingByNumber = new Map();
    for (const t of tables) {
      const n = typeof t.number === "number" ? t.number : parseIntSafe(t.number, 0);
      if (!isNaN(n)) existingByNumber.set(n, t.id);
    }
    let floorTablesAdded = 0;
    for (const num of allTableNumbers) {
      if (isNaN(num) || num < 1) continue;
      if (existingByNumber.has(num)) continue;
      const tid = `table-${num}`;
      await prisma.table.upsert({
        where: { id: tid },
        create: {
          id: tid,
          number: num,
          name: `Masa ${num}`,
          floor: "Main",
          status: "free",
          current_order_id: null,
          capacity: 4,
        },
        update: {},
      });
      existingByNumber.set(num, tid);
      floorTablesAdded++;
    }
    if (floorTablesAdded) console.log("  floor_plan_sections'tan masalar oluşturuldu:", floorTablesAdded);

    // 15. ZohoConfig
    const zc = data.zoho_config || {};
    await prisma.zohoConfig.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        enabled: zc.enabled ?? "false",
        client_id: zc.client_id || null,
        client_secret: zc.client_secret || null,
        refresh_token: zc.refresh_token || null,
        organization_id: zc.organization_id || null,
        customer_id: zc.customer_id || null,
        dc: zc.dc || null,
      },
      update: {
        enabled: zc.enabled,
        client_id: zc.client_id,
        client_secret: zc.client_secret,
        refresh_token: zc.refresh_token,
        organization_id: zc.organization_id,
        customer_id: zc.customer_id,
        dc: zc.dc,
      },
    });
    console.log("  ZohoConfig: OK");

    console.log("\nMigration complete.");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
