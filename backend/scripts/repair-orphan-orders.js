import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function ts(d) {
  if (!d) return null;
  if (d instanceof Date) return d.getTime();
  const n = Number(d);
  if (!Number.isNaN(n)) return n;
  const dd = new Date(d);
  const t = dd.getTime();
  return Number.isNaN(t) ? null : t;
}

async function main() {
  console.log("[repair-orphan-orders] starting");
  const items = await prisma.orderItem.findMany();
  const orders = await prisma.order.findMany();
  const tables = await prisma.table.findMany();
  const payments = await prisma.payment.findMany();

  const orderById = new Map(orders.map((o) => [o.id, o]));
  const tableFallback = tables[0] || null;
  console.log("[repair-orphan-orders] items:", items.length, "orders:", orders.length, "tables:", tables.length, "payments:", payments.length);

  const itemsByOrder = new Map();
  for (const it of items) {
    if (!itemsByOrder.has(it.order_id)) itemsByOrder.set(it.order_id, []);
    itemsByOrder.get(it.order_id).push(it);
  }
  const paymentsByOrder = new Map();
  for (const p of payments) {
    if (!paymentsByOrder.has(p.order_id)) paymentsByOrder.set(p.order_id, []);
    paymentsByOrder.get(p.order_id).push(p);
  }

  let createdCount = 0;
  let undeletedCount = 0;

  for (const [orderId, list] of itemsByOrder.entries()) {
    if (!orderId) continue;
    const existing = orderById.get(orderId);
    const hasItems = list && list.length > 0;
    if (!hasItems) continue;

    if (existing && !existing.deletedAt) {
      continue;
    }

    const subtotal = list.reduce((s, it) => s + (it.quantity || 0) * (it.price || 0), 0);
    const payList = paymentsByOrder.get(orderId) || [];
    const totalPaid = payList.reduce((s, p) => s + (p.amount || 0), 0);
    const createdTsCandidates = [
      ...list.map((it) => ts(it.createdAt)),
      ...list.map((it) => ts(it.sent_at)),
      ...payList.map((p) => ts(p.created_at)),
      ...payList.map((p) => ts(p.createdAt)),
    ].filter((v) => v != null);
    const createdTs = createdTsCandidates.length ? Math.min(...createdTsCandidates) : Date.now();
    const paidTs = createdTsCandidates.length ? Math.max(...createdTsCandidates) : createdTs;

    const base = existing || {};
    const tableId = base.table_id || tableFallback?.id || "recovered-table";
    const tableNumber = base.table_number || (tableFallback ? String(tableFallback.number) : "0");
    const waiterId = base.waiter_id || null;
    const waiterName = base.waiter_name || "Recovered";

    if (existing && existing.deletedAt) {
      await prisma.order.update({
        where: { id: orderId },
        data: {
          deletedAt: null,
          status: base.status || "paid",
          subtotal: base.subtotal || subtotal,
          total: base.total || (totalPaid || subtotal),
          tax_amount: base.tax_amount || 0,
          discount_percent: base.discount_percent || 0,
          discount_amount: base.discount_amount || 0,
          created_at: base.created_at || new Date(createdTs),
          paid_at: base.paid_at || new Date(paidTs),
        },
      });
      undeletedCount += 1;
      console.log("[repair-orphan-orders] undeleted existing order", orderId);
      continue;
    }

    await prisma.order.create({
      data: {
        id: orderId,
        table_id: tableId,
        table_number: tableNumber,
        waiter_id: waiterId,
        waiter_name: waiterName,
        status: "paid",
        subtotal,
        tax_amount: 0,
        discount_percent: 0,
        discount_amount: 0,
        total: totalPaid || subtotal,
        created_at: new Date(createdTs),
        paid_at: new Date(paidTs),
      },
    });
    createdCount += 1;
    console.log("[repair-orphan-orders] created order", orderId, "subtotal=", subtotal, "totalPaid=", totalPaid);
  }

  console.log("[repair-orphan-orders] done. created:", createdCount, "undeleted:", undeletedCount);
}

main()
  .catch((e) => {
    console.error("[repair-orphan-orders] ERROR", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

