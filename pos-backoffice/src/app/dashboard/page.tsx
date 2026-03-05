"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Coins,
  UtensilsCrossed,
  Receipt,
  RefreshCw,
  Moon,
  ChevronRight,
  Bell,
  FileEdit,
} from "lucide-react";
import { getDashboardStats, getDailySales, getOpenOrders, getClosedBillChanges, runEod } from "@/lib/api";

type PaidTicket = { order_id: string; receipt_no?: string; table_number: string; total: number; paid_at: number; waiter_name?: string; cash_amount: number; card_amount: number; discount_amount?: number };
type OpenOrderRow = { order_id: string; receipt_no: string; table_number: string; total: number; waiter_name: string; created_at: number; status: string };
type TicketModalType = "cash" | "card" | "all" | "void" | "refund" | "open" | null;

function toYYYYMMDD(d: Date) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
const blockButtonClass = "flex items-center gap-4 p-5 rounded-xl bg-slate-800/60 border border-slate-700 hover:border-sky-500/50 hover:bg-slate-800/80 transition-colors text-left cursor-pointer w-full";

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatEodTime(ts: number) {
  return new Date(ts).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });
}

const POLL_INTERVAL_MS = 8000;

export default function DashboardPage() {
  const [stats, setStats] = useState({
    todaySales: 0,
    orderCount: 0,
    openTables: 0,
    openChecks: 0,
    lastEod: null as { ran_at: number; user_name: string; tables_closed_count: number } | null,
    openTablesCount: 0,
    pendingVoidRequestsCount: 0,
    pendingClosedBillAccessRequestsCount: 0,
  });
  const [dailySales, setDailySales] = useState<{
    totalCash: number;
    totalCard: number;
    totalSales: number;
    totalVoidAmount: number;
    totalRefundAmount: number;
    paidTickets?: PaidTicket[];
    lastEod?: { ran_at: number; user_name: string; tables_closed_count: number } | null;
    openTablesCount?: number;
    categorySales: Array<{ categoryId: string; categoryName: string; totalAmount: number; totalQuantity: number }>;
    itemSales: Array<{ productId: string; productName: string; categoryId?: string; totalAmount: number; totalQuantity: number }>;
    voids: Array<{ id: string; order_id?: string; type: string; product_name: string; quantity: number; amount: number; user_name: string; created_at: number }>;
    refunds: Array<{ id: string; order_id?: string; type: string; product_name?: string; amount: number; user_name: string; source_table_number?: string; created_at: number }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [ticketModalType, setTicketModalType] = useState<TicketModalType>(null);
  const [selectedDateFrom, setSelectedDateFrom] = useState<string | null>(null);
  const [selectedDateTo, setSelectedDateTo] = useState<string | null>(null);
  const [openOrders, setOpenOrders] = useState<OpenOrderRow[]>([]);
  const [openOrdersLoading, setOpenOrdersLoading] = useState(false);
  const [eodConfirmOpen, setEodConfirmOpen] = useState(false);
  const [closedBillChanges, setClosedBillChanges] = useState<{ count: number; summary: { fullRefunds: number; itemRefunds: number; paymentMethodChanges?: number }; changes: Array<{ id: string; order_id: string; receipt_no: string | null; table_number: string; type: string; product_name: string | null; amount: number; user_name: string; created_at: number; details?: string | null }> } | null>(null);
  const [closedBillChangesModal, setClosedBillChangesModal] = useState(false);
  const [approvalRequestsCountPrev, setApprovalRequestsCountPrev] = useState(0);
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(null);
  const router = useRouter();

  const fetchData = useCallback(async () => {
    try {
      const from = selectedDateFrom || undefined;
      const to = selectedDateTo || undefined;
      const useRange = from && to;
      const singleDate = from || to;
      const [statsRes, dailyRes, closedChangesRes] = await Promise.all([
        getDashboardStats(),
        useRange ? getDailySales(undefined, from, to) : getDailySales(singleDate),
        useRange ? getClosedBillChanges(undefined, from, to) : getClosedBillChanges(singleDate).catch(() => ({ count: 0, summary: { fullRefunds: 0, itemRefunds: 0, paymentMethodChanges: 0 }, changes: [] })),
      ]);
      setClosedBillChanges(closedChangesRes);
      setStats({
        todaySales: statsRes.todaySales ?? 0,
        orderCount: statsRes.orderCount ?? 0,
        openTables: statsRes.openTables ?? 0,
        openChecks: statsRes.openChecks ?? 0,
        lastEod: statsRes.lastEod ?? null,
        openTablesCount: statsRes.openTablesCount ?? statsRes.openTables ?? 0,
        pendingVoidRequestsCount: statsRes.pendingVoidRequestsCount ?? 0,
        pendingClosedBillAccessRequestsCount: statsRes.pendingClosedBillAccessRequestsCount ?? 0,
      });
      setDailySales(dailyRes);
      setLastRefresh(new Date());
    } catch {
      setStats({ todaySales: 0, orderCount: 0, openTables: 0, openChecks: 0, lastEod: null, openTablesCount: 0, pendingVoidRequestsCount: 0, pendingClosedBillAccessRequestsCount: 0 });
      setDailySales(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedDateFrom, selectedDateTo]);

  async function handleOpenTablesClick() {
    setTicketModalType("open");
    setOpenOrdersLoading(true);
    try {
      const list = await getOpenOrders();
      setOpenOrders(list);
    } catch {
      setOpenOrders([]);
    } finally {
      setOpenOrdersLoading(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await fetchData();
  }

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchData]);

  const totalApprovalRequests = (stats.pendingVoidRequestsCount ?? 0) + (stats.pendingClosedBillAccessRequestsCount ?? 0);
  useEffect(() => {
    if (totalApprovalRequests > 0 && totalApprovalRequests > approvalRequestsCountPrev) {
      setApprovalRequestsCountPrev(totalApprovalRequests);
      try {
        const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 800;
        gain.gain.value = 0.15;
        osc.start();
        setTimeout(() => { osc.stop(); }, 150);
      } catch { /* no sound */ }
    } else if (totalApprovalRequests === 0) {
      setApprovalRequestsCountPrev(0);
    }
  }, [totalApprovalRequests, approvalRequestsCountPrev]);

  const todayStr = toYYYYMMDD(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = toYYYYMMDD(yesterday);

  return (
    <div className="min-h-screen bg-black">
      <header className="border-b border-slate-800 bg-slate-900 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/" className="p-2 rounded-lg hover:bg-slate-800 transition-colors">
            <ArrowLeft className="w-5 h-5 text-slate-300" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-sky-400">Dashboard</h1>
            <p className="text-slate-400 text-sm">Sales, open checks, reports · Auto-refresh 8s</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-slate-400 text-sm">From:</span>
          <input type="date" value={selectedDateFrom ?? ""} max={todayStr} onChange={(e) => setSelectedDateFrom(e.target.value || null)} className="px-3 py-1.5 rounded-lg bg-slate-700 text-slate-200 border border-slate-600 text-sm" />
          <span className="text-slate-400 text-sm">To:</span>
          <input type="date" value={selectedDateTo ?? ""} max={todayStr} onChange={(e) => setSelectedDateTo(e.target.value || null)} className="px-3 py-1.5 rounded-lg bg-slate-700 text-slate-200 border border-slate-600 text-sm" />
          <button type="button" onClick={() => { setSelectedDateFrom(null); setSelectedDateTo(null); }} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${selectedDateFrom === null && selectedDateTo === null ? "bg-sky-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`}>Today</button>
          <button type="button" onClick={() => { setSelectedDateFrom(yesterdayStr); setSelectedDateTo(yesterdayStr); }} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${selectedDateFrom === yesterdayStr && selectedDateTo === yesterdayStr ? "bg-sky-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`}>Yesterday</button>
        </div>
        <button onClick={handleRefresh} disabled={refreshing} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </header>

      <main className="p-6 space-y-8 max-w-4xl mx-auto">
        {/* Row 1: Total Sales, Total Card, Total Cash, Open Tables */}
        <section>
          <h2 className="text-lg font-semibold text-slate-200 mb-4">Overview (tap to view tickets)</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <button type="button" className={blockButtonClass} onClick={() => setTicketModalType("all")}>
              <Coins className="w-8 h-8 text-emerald-400 shrink-0" />
              <div>
                <p className="text-slate-400 text-sm">Total Sales</p>
                <p className="text-xl font-bold text-white">{loading ? "..." : fmt(dailySales?.totalSales ?? stats.todaySales ?? 0)} AED</p>
              </div>
            </button>
            <button type="button" className={blockButtonClass} onClick={() => setTicketModalType("card")}>
              <Receipt className="w-8 h-8 text-sky-400 shrink-0" />
              <div>
                <p className="text-slate-400 text-sm">Total Card</p>
                <p className="text-xl font-bold text-white">{loading ? "..." : fmt(dailySales?.totalCard ?? 0)} AED</p>
              </div>
            </button>
            <button type="button" className={blockButtonClass} onClick={() => setTicketModalType("cash")}>
              <Coins className="w-8 h-8 text-amber-400 shrink-0" />
              <div>
                <p className="text-slate-400 text-sm">Total Cash</p>
                <p className="text-xl font-bold text-white">{loading ? "..." : fmt(dailySales?.totalCash ?? 0)} AED</p>
              </div>
            </button>
            <button type="button" className={blockButtonClass} onClick={handleOpenTablesClick}>
              <UtensilsCrossed className="w-8 h-8 text-amber-400 shrink-0" />
              <div>
                <p className="text-slate-400 text-sm">Open Tables</p>
                <p className="text-xl font-bold text-white">{loading ? "..." : stats.openTables}</p>
              </div>
            </button>
          </div>
          {/* Row 2: Approval Request, Closed Bill Changes, Total Void, Refund Total */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
            <button type="button" className={blockButtonClass} onClick={() => { setTicketModalType(null); router.push("/dashboard/approvals"); }}>
              <Bell className="w-8 h-8 text-orange-400 shrink-0" />
              <div>
                <p className="text-slate-400 text-sm">Approval Request</p>
                <p className="text-xl font-bold text-white">{loading ? "..." : totalApprovalRequests}</p>
                <p className="text-xs text-slate-500">Void + Closed Bill</p>
              </div>
            </button>
            <button
              type="button"
              className={blockButtonClass}
              onClick={() => setClosedBillChangesModal(true)}
            >
              <FileEdit className="w-8 h-8 text-rose-400 shrink-0" />
              <div>
                <p className="text-slate-400 text-sm">Closed Bill Changes</p>
                <p className="text-xl font-bold text-white">
                  {loading ? "..." : (closedBillChanges?.count ?? 0)}
                </p>
              </div>
            </button>
            <button type="button" className={blockButtonClass} onClick={() => setTicketModalType("void")}>
              <Receipt className="w-8 h-8 text-red-400 shrink-0" />
              <div>
                <p className="text-slate-400 text-sm">Total Void</p>
                <p className="text-xl font-bold text-red-400">{loading ? "..." : fmt(dailySales?.totalVoidAmount ?? 0)} AED</p>
              </div>
            </button>
            <button type="button" className={blockButtonClass} onClick={() => setTicketModalType("refund")}>
              <Receipt className="w-8 h-8 text-red-400 shrink-0" />
              <div>
                <p className="text-slate-400 text-sm">Refund Total</p>
                <p className="text-xl font-bold text-red-400">{loading ? "..." : fmt(dailySales?.totalRefundAmount ?? 0)} AED</p>
              </div>
            </button>
          </div>
          {lastRefresh && (
            <p className="text-slate-500 text-xs mt-2">Last updated: {lastRefresh.toLocaleTimeString()}</p>
          )}

          {/* End of Day bilgisi */}
          <div className="mt-4 p-4 rounded-xl bg-slate-800/40 border border-slate-700 flex flex-wrap items-center gap-4">
            <Moon className="w-5 h-5 text-amber-400 shrink-0" />
            <div className="flex-1 min-w-0">
              {stats.lastEod ? (
                <p className="text-slate-400 text-sm">
                  Son gün kapatma: <span className="text-slate-200">{formatEodTime(stats.lastEod.ran_at)}</span>
                  {stats.lastEod.tables_closed_count > 0 && (
                    <span className="text-amber-400 ml-1">({stats.lastEod.tables_closed_count} masa EOD&apos;da kapatıldı)</span>
                  )}
                </p>
              ) : (
                <p className="text-slate-400 text-sm">Henüz gün kapatma yapılmadı.</p>
              )}
              {stats.openTablesCount > 0 && (
                <p className="text-amber-400 text-sm mt-1">
                  <strong>{stats.openTablesCount}</strong> open check(s). Scroll to End of Day to close.
                </p>
              )}
            </div>
            {selectedDateFrom === null && selectedDateTo === null && (
              <a href="#eod" className="px-3 py-1.5 rounded-lg bg-amber-600/80 hover:bg-amber-500 text-white text-sm font-medium">
                End of Day / Günü Kapat
              </a>
            )}
          </div>
        </section>

        {/* Daily Sales — tap blocks to view tickets (Receipt #, Date, Who) */}
        <section>
          <h2 className="text-lg font-semibold text-slate-200 mb-4">
            {selectedDateFrom === null && selectedDateTo === null
              ? "Today"
              : selectedDateFrom === yesterdayStr && selectedDateTo === yesterdayStr
                ? "Yesterday"
                : selectedDateFrom && selectedDateTo && selectedDateFrom !== selectedDateTo
                  ? `${selectedDateFrom} – ${selectedDateTo}`
                  : selectedDateFrom || selectedDateTo || "Today"} — Summary (tap to view tickets)
          </h2>
          {loading && !dailySales ? (
            <p className="text-slate-400 py-8">Loading...</p>
          ) : dailySales ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button type="button" className="p-5 rounded-xl bg-slate-800/60 border border-slate-700 hover:border-sky-500/50 hover:bg-slate-800/80 transition-colors text-left" onClick={() => setTicketModalType("cash")}>
                  <p className="text-slate-400 text-sm">Total Cash</p>
                  <p className="text-2xl font-bold text-white">{fmt(dailySales.totalCash)} AED</p>
                </button>
                <button type="button" className="p-5 rounded-xl bg-slate-800/60 border border-slate-700 hover:border-sky-500/50 hover:bg-slate-800/80 transition-colors text-left" onClick={() => setTicketModalType("card")}>
                  <p className="text-slate-400 text-sm">Total Card</p>
                  <p className="text-2xl font-bold text-white">{fmt(dailySales.totalCard)} AED</p>
                </button>
                <button type="button" className="p-5 rounded-xl bg-slate-800/60 border border-slate-700 hover:border-sky-500/50 hover:bg-slate-800/80 transition-colors text-left" onClick={() => setTicketModalType("all")}>
                  <p className="text-slate-400 text-sm">Total Sales</p>
                  <p className="text-2xl font-bold text-emerald-400">{fmt(dailySales.totalSales)} AED</p>
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button type="button" className="p-5 rounded-xl bg-slate-800/60 border border-slate-700 hover:border-sky-500/50 hover:bg-slate-800/80 transition-colors text-left" onClick={() => setTicketModalType("void")}>
                  <p className="text-slate-400 text-sm">Total Void</p>
                  <p className="text-xl font-bold text-red-400">{fmt(dailySales.totalVoidAmount)} AED</p>
                </button>
                <button type="button" className="p-5 rounded-xl bg-slate-800/60 border border-slate-700 hover:border-sky-500/50 hover:bg-slate-800/80 transition-colors text-left" onClick={() => setTicketModalType("refund")}>
                  <p className="text-slate-400 text-sm">Refund Total</p>
                  <p className="text-xl font-bold text-red-400">{fmt(dailySales.totalRefundAmount)} AED</p>
                </button>
              </div>

              {dailySales.categorySales.length > 0 && (
                <>
                  <h3 className="text-base font-semibold text-slate-200">Category Sales (tap to see items)</h3>
                  <div className="space-y-2">
                    {dailySales.categorySales.map((row) => {
                      const isExpanded = expandedCategoryId === row.categoryId;
                      const categoryItems = (dailySales.itemSales || []).filter(
                        (item) => (item.categoryId || "") === row.categoryId
                      );
                      return (
                        <div key={row.categoryId} className="rounded-lg bg-slate-800/40 border border-slate-700 overflow-hidden">
                          <button
                            type="button"
                            onClick={() => setExpandedCategoryId(isExpanded ? null : row.categoryId)}
                            className="flex justify-between items-center p-4 w-full text-left hover:bg-slate-700/40 transition-colors"
                          >
                            <div>
                              <p className="font-medium text-white">{row.categoryName || row.categoryId}</p>
                              <p className="text-slate-500 text-sm">Qty: {row.totalQuantity}</p>
                            </div>
                            <p className="font-bold text-sky-400">{fmt(row.totalAmount)} AED</p>
                            <span className="text-slate-400 text-sm ml-2">{isExpanded ? "▼" : "▶"}</span>
                          </button>
                          {isExpanded && categoryItems.length > 0 && (
                            <div className="border-t border-slate-700 p-3 bg-slate-900/50">
                              <p className="text-slate-400 text-sm font-medium mb-2">Items in this category</p>
                              <div className="space-y-1.5">
                                {categoryItems.map((item) => (
                                  <div
                                    key={item.productId}
                                    className="flex justify-between items-center py-2 px-3 rounded bg-slate-800/60"
                                  >
                                    <span className="text-slate-200 text-sm">{item.productName}</span>
                                    <span className="text-slate-400 text-sm">x{item.totalQuantity}</span>
                                    <span className="text-sky-400 font-medium text-sm">{fmt(item.totalAmount)} AED</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {isExpanded && categoryItems.length === 0 && (
                            <div className="border-t border-slate-700 p-3 bg-slate-900/50 text-slate-500 text-sm">
                              No item breakdown for this category.
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {selectedDateFrom === null && selectedDateTo === null && (
                <section id="eod" className="rounded-xl bg-slate-800/60 border border-slate-700 p-5 mt-6">
                  <h3 className="text-lg font-semibold text-slate-200 mb-3 flex items-center gap-2">
                    <Moon className="w-5 h-5 text-amber-400" />
                    End of Day / Günü Kapat
                  </h3>
                  <p className="text-slate-400 text-sm mb-4">Close the business day. If there are open checks, you can mark them as paid and close.</p>
                  {dailySales?.lastEod && (
                    <p className="text-slate-400 text-sm mb-3">Last run: <strong className="text-slate-200">{formatEodTime(dailySales.lastEod.ran_at)}</strong></p>
                  )}
                  {(dailySales?.openTablesCount ?? 0) > 0 && (
                    <p className="text-amber-400 text-sm mb-3"><strong>{dailySales.openTablesCount}</strong> open check(s) will be marked as paid.</p>
                  )}
                  <button type="button" onClick={() => setEodConfirmOpen(true)} className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium">
                    Run End of Day
                  </button>
                </section>
              )}

              {dailySales.categorySales.length === 0 &&
                dailySales.itemSales.length === 0 &&
                dailySales.voids.length === 0 &&
                dailySales.refunds.length === 0 &&
                dailySales.totalSales === 0 && (
                  <p className="text-slate-500 py-8 text-center">No sales data for this day.</p>
                )}
            </div>
          ) : (
            <p className="text-slate-500 py-8">Could not load daily sales. Check API connection.</p>
          )}
        </section>
      </main>

      {/* Closed Bill Change modal */}
      {closedBillChangesModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setClosedBillChangesModal(false)}>
          <div className="bg-slate-900 rounded-xl border border-slate-700 max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-700 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-slate-200">Closed Bill Change</h3>
              <button type="button" onClick={() => setClosedBillChangesModal(false)} className="text-slate-400 hover:text-white">Close</button>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              {closedBillChanges && closedBillChanges.changes.length > 0 ? (
                <ul className="space-y-2">
                  {closedBillChanges.changes.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => { setClosedBillChangesModal(false); router.push(`/orders/${c.order_id}`); }}
                        className="w-full p-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-left"
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-medium text-slate-200">{c.receipt_no ?? "—"} · Table {c.table_number}</span>
                          <span className={c.type === "payment_method_change" ? "text-amber-400" : "text-red-400"}>
                            {c.type === "refund_full" ? "Full refund" : c.type === "payment_method_change" ? (c.details || "Payment method change") : "Item refund"}
                          </span>
                        </div>
                        <p className="text-slate-500 text-xs mt-1">
                          {c.type === "payment_method_change" ? "" : `${fmt(c.amount)} AED · `}{c.user_name} · {new Date(c.created_at).toLocaleString("tr-TR")}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-slate-500 py-4">No closed bill changes for this day.</p>
              )}
            </div>
            {closedBillChanges && (closedBillChanges.summary.fullRefunds > 0 || closedBillChanges.summary.itemRefunds > 0 || (closedBillChanges.summary.paymentMethodChanges ?? 0) > 0) && (
              <div className="p-4 border-t border-slate-700 bg-slate-800/50 text-sm text-slate-300">
                <p><strong>Summary:</strong> {closedBillChanges.summary.fullRefunds} full bill refund(s), {closedBillChanges.summary.itemRefunds} item refund(s){closedBillChanges.summary.paymentMethodChanges ? `, ${closedBillChanges.summary.paymentMethodChanges} payment method change(s)` : ""}.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* EOD confirm modal */}
      {eodConfirmOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-xl border border-slate-700 p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-amber-400 mb-2">End of Day</h3>
            <p className="text-slate-400 text-sm mb-4">Close the day? Open checks will be marked as paid.</p>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setEodConfirmOpen(false)} className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white">Cancel</button>
              <button type="button" onClick={async () => { setEodConfirmOpen(false); try { await runEod(true); await fetchData(); } catch (e) { alert((e as Error).message); } }} className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white">Run EOD</button>
            </div>
          </div>
        </div>
      )}

      {/* Ticket list modal */}
      {ticketModalType && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setTicketModalType(null)}>
          <div className="bg-slate-900 rounded-xl border border-slate-700 max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-700 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-slate-200">
                {ticketModalType === "cash" && "Cash tickets"}
                {ticketModalType === "card" && "Card tickets"}
                {ticketModalType === "all" && "All tickets"}
                {ticketModalType === "open" && "Open Tables / Checks"}
                {ticketModalType === "void" && "Void entries"}
                {ticketModalType === "refund" && "Refund entries"}
              </h3>
              <button type="button" onClick={() => setTicketModalType(null)} className="text-slate-400 hover:text-white">Close</button>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              {ticketModalType === "open" && (openOrdersLoading ? (
                <p className="text-slate-500 py-4">Loading...</p>
              ) : openOrders.length === 0 ? (
                <p className="text-slate-500 py-4">No open checks</p>
              ) : (
                <ul className="space-y-2">
                  {openOrders.map((o) => (
                    <li key={o.order_id}>
                      <button type="button" onClick={() => { setTicketModalType(null); router.push(`/orders/${o.order_id}`); }} className="w-full p-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-left">
                        <div className="flex justify-between items-center">
                          <span className="font-medium text-slate-200">{o.receipt_no} · Table {o.table_number}</span>
                          <span className="text-sky-400">{fmt(o.total)} AED</span>
                        </div>
                        <p className="text-slate-500 text-xs mt-1">Date: {new Date(o.created_at).toLocaleString("en-GB")} · By: {o.waiter_name}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              ))}
              {ticketModalType !== "void" && ticketModalType !== "refund" && ticketModalType !== "open" && (() => {
                const tickets = dailySales?.paidTickets || [];
                const filtered = ticketModalType === "cash" ? tickets.filter((t) => (t.cash_amount || 0) > 0)
                  : ticketModalType === "card" ? tickets.filter((t) => (t.card_amount || 0) > 0)
                  : tickets;
                if (filtered.length === 0) return <p className="text-slate-500 py-4">No tickets</p>;
                return (
                  <ul className="space-y-2">
                    {filtered.map((t) => (
                      <li key={t.order_id}>
                        <button type="button" onClick={() => { setTicketModalType(null); router.push(`/orders/${t.order_id}`); }} className="w-full p-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-left relative">
                          <div className="flex justify-between items-center">
                            <span className="font-medium text-slate-200">{t.receipt_no || t.table_number} · Table {t.table_number} · {fmt(t.total)} AED</span>
                            <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" />
                          </div>
                          <p className="text-slate-500 text-xs mt-1">Date: {new Date(t.paid_at).toLocaleString("en-GB")} · By: {t.waiter_name ?? "—"}</p>
                        </button>
                      </li>
                    ))}
                  </ul>
                );
              })()}
              {ticketModalType === "void" && (dailySales?.voids?.length ? (
                <ul className="space-y-2">
                  {dailySales.voids.map((v) => (
                    <li key={v.id}>
                      <div className="p-3 rounded-lg bg-slate-800">
                        <p className="text-slate-200 text-sm">{v.product_name || "Void"} · {fmt(v.amount || 0)} AED · {v.user_name}</p>
                        {v.order_id && (
                          <button type="button" onClick={() => { setTicketModalType(null); router.push(`/orders/${v.order_id}`); }} className="mt-2 text-sky-400 text-sm flex items-center gap-1">View order <ChevronRight className="w-4 h-4" /></button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-slate-500 py-4">No void entries</p>)}
              {ticketModalType === "refund" && (dailySales?.refunds?.length ? (
                <ul className="space-y-2">
                  {dailySales.refunds.map((v) => (
                    <li key={v.id}>
                      <div className="p-3 rounded-lg bg-slate-800">
                        <p className="text-slate-200 text-sm">{fmt(v.amount)} AED · {v.user_name}</p>
                        {v.order_id && (
                          <button type="button" onClick={() => { setTicketModalType(null); router.push(`/orders/${v.order_id}`); }} className="mt-2 text-sky-400 text-sm flex items-center gap-1">View order <ChevronRight className="w-4 h-4" /></button>
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
    </div>
  );
}
