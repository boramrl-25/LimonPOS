"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, RefreshCw, BarChart3, Moon, ChevronRight } from "lucide-react";
import { getDailySales, runEod } from "@/lib/api";

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatEodTime(ts: number) {
  return new Date(ts).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });
}

type PaidTicket = {
  order_id: string;
  table_number: string;
  total: number;
  paid_at: number;
  cash_amount: number;
  card_amount: number;
  discount_amount?: number;
};

type DailySalesData = {
  totalCash: number;
  totalCard: number;
  totalSales: number;
  netSales?: number;
  totalVoidAmount: number;
  totalRefundAmount: number;
  paidTickets?: PaidTicket[];
  categorySales: Array<{ categoryId: string; categoryName: string; totalAmount: number; totalQuantity: number }>;
  itemSales: Array<{ productId: string; productName: string; totalAmount: number; totalQuantity: number }>;
  voids: Array<{ id: string; order_id?: string; type: string; product_name: string; quantity: number; amount: number; user_name: string; created_at: number }>;
  refunds: Array<{ id: string; order_id?: string; type: string; product_name?: string; amount: number; user_name: string; source_table_number?: string; created_at: number }>;
  lastEod?: { ran_at: number; user_name: string; tables_closed_count: number } | null;
  openTablesCount?: number;
};

type TicketModalType = "cash" | "card" | "all" | "void" | "refund" | "discount" | null;

const blockButtonClass = "p-5 rounded-xl bg-slate-800/60 border border-slate-700 hover:border-sky-500/50 hover:bg-slate-800/80 transition-colors text-left cursor-pointer";

export default function DailySalesPage() {
  const router = useRouter();
  const [data, setData] = useState<DailySalesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [eodRunning, setEodRunning] = useState(false);
  const [eodConfirmOpen, setEodConfirmOpen] = useState(false);
  const [ticketModalType, setTicketModalType] = useState<TicketModalType>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await getDailySales();
      setData(res);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 30000);
    return () => clearInterval(id);
  }, [fetchData]);

  async function handleRefresh() {
    setRefreshing(true);
    await fetchData();
  }

  async function handleEodClick() {
    const openCount = data?.openTablesCount ?? 0;
    if (openCount > 0) {
      setEodConfirmOpen(true);
      return;
    }
    await doRunEod();
  }

  async function doRunEod() {
    setEodConfirmOpen(false);
    setEodRunning(true);
    try {
      await runEod(true);
      await fetchData();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setEodRunning(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <header className="border-b border-slate-800 bg-slate-900 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="p-2 rounded-lg hover:bg-slate-800 transition-colors">
            <ArrowLeft className="w-5 h-5 text-slate-300" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-sky-400 flex items-center gap-2">
              <BarChart3 className="w-6 h-6" />
              Daily Sales
            </h1>
            <p className="text-slate-400 text-sm mt-0.5">Combined daily sales report from all apps</p>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </header>

      <main className="p-6 max-w-4xl mx-auto">
        {loading && !data ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-10 h-10 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : data ? (
          <div className="space-y-8">
            {/* Summary Cards — tap to open ticket list */}
            <section>
              <h2 className="text-lg font-semibold text-slate-200 mb-4">Today&apos;s Summary (tap to view tickets)</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
                <button type="button" className={blockButtonClass} onClick={() => setTicketModalType("cash")}>
                  <p className="text-slate-400 text-sm">Cash</p>
                  <p className="text-2xl font-bold text-white">{fmt(data.totalCash)}</p>
                </button>
                <button type="button" className={blockButtonClass} onClick={() => setTicketModalType("card")}>
                  <p className="text-slate-400 text-sm">Card</p>
                  <p className="text-2xl font-bold text-white">{fmt(data.totalCard)}</p>
                </button>
                <button type="button" className={blockButtonClass} onClick={() => setTicketModalType("all")}>
                  <p className="text-slate-400 text-sm">Total Sales</p>
                  <p className="text-2xl font-bold text-emerald-400">{fmt(data.totalSales)}</p>
                </button>
                {typeof data.netSales === "number" && (
                  <button type="button" className={blockButtonClass} onClick={() => setTicketModalType("all")}>
                    <p className="text-slate-400 text-sm">Net (after refunds)</p>
                    <p className="text-2xl font-bold text-sky-400">{fmt(data.netSales)}</p>
                  </button>
                )}
                <button type="button" className={blockButtonClass} onClick={() => setTicketModalType("void")}>
                  <p className="text-slate-400 text-sm">Total Void</p>
                  <p className="text-xl font-bold text-red-400">{fmt(data.totalVoidAmount)}</p>
                </button>
                <button type="button" className={blockButtonClass} onClick={() => setTicketModalType("refund")}>
                  <p className="text-slate-400 text-sm">Total Refunds</p>
                  <p className="text-xl font-bold text-red-400">{fmt(data.totalRefundAmount)}</p>
                </button>
              </div>
            </section>

            {/* End of Day */}
            <section className="rounded-xl bg-slate-800/60 border border-slate-700 p-5">
              <h2 className="text-lg font-semibold text-slate-200 mb-3 flex items-center gap-2">
                <Moon className="w-5 h-5 text-amber-400" />
                Günü Kapat (End of Day)
              </h2>
              <p className="text-slate-400 text-sm mb-4">
                Gece 12 sonrası satışlar için günü kapatın. Açık masa varsa uyarı verilir; onaylarsanız masalar ödeme alınmış sayılıp kapatılır.
              </p>
              {data?.lastEod && (
                <p className="text-slate-400 text-sm mb-3">
                  Son gün kapatma: <strong className="text-slate-200">{formatEodTime(data.lastEod.ran_at)}</strong>
                  {data.lastEod.tables_closed_count > 0 && (
                    <span className="ml-2 text-amber-400">({data.lastEod.tables_closed_count} masa EOD&apos;da kapatıldı)</span>
                  )}
                </p>
              )}
              {(data?.openTablesCount ?? 0) > 0 && (
                <p className="text-amber-400 text-sm mb-3">
                  Uyarı: <strong>{data.openTablesCount}</strong> masa hâlâ açık. Günü kapatmak için aşağıdaki butona tıklayın; açık masalar ödeme alınmış sayılıp kapatılacak.
                </p>
              )}
              <button
                type="button"
                onClick={handleEodClick}
                disabled={eodRunning}
                className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium disabled:opacity-50"
              >
                {eodRunning ? "Kapatılıyor..." : "Günü Kapat"}
              </button>
            </section>

            {/* Category Sales */}
            {data.categorySales.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold text-slate-200 mb-4">Category Sales</h2>
                <div className="space-y-2">
                  {data.categorySales.map((row) => (
                    <div
                      key={row.categoryId}
                      className="flex justify-between items-center p-4 rounded-lg bg-slate-800/40 border border-slate-700"
                    >
                      <div>
                        <p className="font-medium text-white">{row.categoryName || row.categoryId}</p>
                        <p className="text-slate-500 text-sm">Qty: {row.totalQuantity}</p>
                      </div>
                      <p className="font-bold text-sky-400">{fmt(row.totalAmount)}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Item Sales */}
            {data.itemSales.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold text-slate-200 mb-4">Product Sales</h2>
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {data.itemSales.map((row) => (
                    <div
                      key={row.productId}
                      className="flex justify-between items-center p-4 rounded-lg bg-slate-800/40 border border-slate-700"
                    >
                      <div>
                        <p className="font-medium text-white">{row.productName}</p>
                        <p className="text-slate-500 text-sm">x{row.totalQuantity}</p>
                      </div>
                      <p className="font-bold text-sky-400">{fmt(row.totalAmount)}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Void Details */}
            {data.voids.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold text-slate-200 mb-4">Void Details</h2>
                <div className="space-y-2">
                  {data.voids.map((v) => (
                    <div key={v.id} className="p-4 rounded-lg bg-slate-800/40 border border-slate-700">
                      <div className="flex justify-between">
                        <span className="text-amber-400 font-medium">
                          {v.type === "pre_void" ? "Pre-print Void" : v.type === "post_void" ? "Post-print Void" : v.type === "recalled_void" ? "Recalled Void" : v.type}
                        </span>
                        <span className="text-slate-500 text-sm">{new Date(v.created_at).toLocaleTimeString()}</span>
                      </div>
                      {v.product_name && <p className="text-slate-400 text-sm">{v.product_name} x{v.quantity || 1}</p>}
                      <p className="text-red-400">Amount: {fmt(v.amount || 0)}</p>
                      <p className="text-slate-500 text-xs">By: {v.user_name}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Refund Details */}
            {data.refunds.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold text-slate-200 mb-4">Refund Details</h2>
                <div className="space-y-2">
                  {data.refunds.map((v) => (
                    <div key={v.id} className="p-4 rounded-lg bg-slate-800/40 border border-slate-700">
                      <div className="flex justify-between">
                        <span className="text-red-400 font-medium">
                          {v.type === "refund_full" ? "Full Refund" : "Refund"}
                        </span>
                        <span className="text-slate-500 text-sm">{new Date(v.created_at).toLocaleTimeString()}</span>
                      </div>
                      {v.product_name && <p className="text-slate-400 text-sm">{v.product_name}</p>}
                      {v.source_table_number && <p className="text-slate-400 text-sm">Table {v.source_table_number}</p>}
                      <p className="text-red-400">Amount: {fmt(v.amount || 0)}</p>
                      <p className="text-slate-500 text-xs">By: {v.user_name}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {data.totalSales === 0 &&
              data.categorySales.length === 0 &&
              data.itemSales.length === 0 &&
              data.voids.length === 0 &&
              data.refunds.length === 0 && (
                <p className="text-slate-500 py-12 text-center">
                  No sales data yet today. It will appear here when synced from apps.
                </p>
              )}
          </div>
        ) : (
          <p className="text-slate-500 py-12 text-center">Failed to load data. Check API connection.</p>
        )}
      </main>

      {/* Ticket list modal — tap block to see tickets, then tap one to view order */}
      {ticketModalType && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setTicketModalType(null)}>
          <div className="bg-slate-900 rounded-xl border border-slate-700 max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-700 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-slate-200">
                {ticketModalType === "cash" && "Cash tickets"}
                {ticketModalType === "card" && "Card tickets"}
                {ticketModalType === "all" && "All tickets"}
                {ticketModalType === "void" && "Void entries"}
                {ticketModalType === "refund" && "Refund entries"}
                {ticketModalType === "discount" && "Discount tickets"}
              </h3>
              <button type="button" onClick={() => setTicketModalType(null)} className="text-slate-400 hover:text-white">Close</button>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              {ticketModalType !== "void" && ticketModalType !== "refund" && (() => {
                const tickets = data?.paidTickets || [];
                const filtered = ticketModalType === "cash" ? tickets.filter((t) => (t.cash_amount || 0) > 0)
                  : ticketModalType === "card" ? tickets.filter((t) => (t.card_amount || 0) > 0)
                  : ticketModalType === "discount" ? tickets.filter((t) => (t.discount_amount || 0) > 0)
                  : tickets;
                if (filtered.length === 0) return <p className="text-slate-500 py-4">No tickets</p>;
                return (
                  <ul className="space-y-2">
                    {filtered.map((t) => (
                      <li key={t.order_id}>
                        <button
                          type="button"
                          onClick={() => { setTicketModalType(null); router.push(`/orders/${t.order_id}`); }}
                          className="w-full flex items-center justify-between p-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-left"
                        >
                          <span className="text-slate-200">Table {t.table_number} · {fmt(t.total)} AED</span>
                          <ChevronRight className="w-5 h-5 text-slate-400" />
                        </button>
                        <p className="text-slate-500 text-xs mt-0.5 ml-3">{new Date(t.paid_at).toLocaleString("en-GB")}</p>
                      </li>
                    ))}
                  </ul>
                );
              })()}
              {ticketModalType === "void" && (data?.voids?.length ? (
                <ul className="space-y-2">
                  {data.voids.map((v) => (
                    <li key={v.id}>
                      <div className="p-3 rounded-lg bg-slate-800">
                        <p className="text-slate-200 text-sm">{v.product_name || "Void"} · {fmt(v.amount || 0)} AED · {v.user_name}</p>
                        {v.order_id && (
                          <button type="button" onClick={() => { setTicketModalType(null); router.push(`/orders/${v.order_id}`); }} className="mt-2 text-sky-400 text-sm flex items-center gap-1">
                            View order <ChevronRight className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-slate-500 py-4">No void entries</p>)}
              {ticketModalType === "refund" && (data?.refunds?.length ? (
                <ul className="space-y-2">
                  {data.refunds.map((v) => (
                    <li key={v.id}>
                      <div className="p-3 rounded-lg bg-slate-800">
                        <p className="text-slate-200 text-sm">{fmt(v.amount)} AED · {v.user_name}</p>
                        {(v as { order_id?: string }).order_id && (
                          <button type="button" onClick={() => { setTicketModalType(null); router.push(`/orders/${(v as { order_id: string }).order_id}`); }} className="mt-2 text-sky-400 text-sm flex items-center gap-1">
                            View order <ChevronRight className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-slate-500 py-4">No refund entries</p>)}
            </div>
          </div>
        </div>
      )}

      {/* EOD confirm modal: açık masa var, kapatıp ödeme alınmış say */}
      {eodConfirmOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-xl border border-slate-700 p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-amber-400 mb-2">Açık masalar var</h3>
            <p className="text-slate-400 text-sm mb-4">
              <strong>{data?.openTablesCount ?? 0}</strong> masa hâlâ açık. Günü kapatmak için bu masaları &quot;ödeme alınmış&quot; sayıp kapatmak istiyor musunuz?
            </p>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setEodConfirmOpen(false)} className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white">
                Hayır
              </button>
              <button type="button" onClick={doRunEod} disabled={eodRunning} className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-50">
                {eodRunning ? "Kapatılıyor..." : "Evet, kapat"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
