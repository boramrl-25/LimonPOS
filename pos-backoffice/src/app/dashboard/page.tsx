"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Coins,
  ShoppingCart,
  UtensilsCrossed,
  Receipt,
  RefreshCw,
} from "lucide-react";
import { getDashboardStats, getDailySales } from "@/lib/api";

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const POLL_INTERVAL_MS = 8000;

export default function DashboardPage() {
  const [stats, setStats] = useState({
    todaySales: 0,
    orderCount: 0,
    openTables: 0,
    openChecks: 0,
  });
  const [dailySales, setDailySales] = useState<{
    totalCash: number;
    totalCard: number;
    totalSales: number;
    totalVoidAmount: number;
    totalRefundAmount: number;
    categorySales: Array<{ categoryId: string; categoryName: string; totalAmount: number; totalQuantity: number }>;
    itemSales: Array<{ productId: string; productName: string; totalAmount: number; totalQuantity: number }>;
    voids: Array<{ id: string; type: string; product_name: string; quantity: number; amount: number; user_name: string; created_at: number }>;
    refunds: Array<{ id: string; type: string; product_name: string; amount: number; user_name: string; source_table_number?: string; created_at: number }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, dailyRes] = await Promise.all([
        getDashboardStats(),
        getDailySales(),
      ]);
      setStats({
        todaySales: statsRes.todaySales ?? 0,
        orderCount: statsRes.orderCount ?? 0,
        openTables: statsRes.openTables ?? 0,
        openChecks: statsRes.openChecks ?? 0,
      });
      setDailySales(dailyRes);
      setLastRefresh(new Date());
    } catch {
      setStats({ todaySales: 0, orderCount: 0, openTables: 0, openChecks: 0 });
      setDailySales(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    await fetchData();
  }

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchData]);

  return (
    <div className="min-h-screen bg-slate-950">
      <header className="border-b border-slate-800 bg-slate-900 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="p-2 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-slate-300" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-sky-400">Dashboard</h1>
            <p className="text-slate-400 text-sm">Live sync with app · Auto-refresh every 8s</p>
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

      <main className="p-6 space-y-8 max-w-4xl mx-auto">
        {/* Quick Stats - same as app overview */}
        <section>
          <h2 className="text-lg font-semibold text-slate-200 mb-4">Overview</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center gap-4 p-5 rounded-xl bg-slate-800/60 border border-slate-700">
              <Coins className="w-8 h-8 text-emerald-400" />
              <div>
                <p className="text-slate-400 text-sm">Today&apos;s Sales</p>
                <p className="text-xl font-bold text-white">{loading ? "..." : fmt(stats.todaySales)} AED</p>
              </div>
            </div>
            <div className="flex items-center gap-4 p-5 rounded-xl bg-slate-800/60 border border-slate-700">
              <ShoppingCart className="w-8 h-8 text-sky-400" />
              <div>
                <p className="text-slate-400 text-sm">Orders</p>
                <p className="text-xl font-bold text-white">{loading ? "..." : stats.orderCount}</p>
              </div>
            </div>
            <div className="flex items-center gap-4 p-5 rounded-xl bg-slate-800/60 border border-slate-700">
              <UtensilsCrossed className="w-8 h-8 text-amber-400" />
              <div>
                <p className="text-slate-400 text-sm">Open Tables</p>
                <p className="text-xl font-bold text-white">{loading ? "..." : stats.openTables}</p>
              </div>
            </div>
            <div className="flex items-center gap-4 p-5 rounded-xl bg-slate-800/60 border border-slate-700">
              <Receipt className="w-8 h-8 text-violet-400" />
              <div>
                <p className="text-slate-400 text-sm">Open Checks</p>
                <p className="text-xl font-bold text-white">{loading ? "..." : stats.openChecks}</p>
              </div>
            </div>
          </div>
          {lastRefresh && (
            <p className="text-slate-500 text-xs mt-2">Last updated: {lastRefresh.toLocaleTimeString()}</p>
          )}
        </section>

        {/* Daily Sales - matches app Daily Sales screen */}
        <section>
          <h2 className="text-lg font-semibold text-slate-200 mb-4">Today&apos;s Summary</h2>
          {loading && !dailySales ? (
            <p className="text-slate-400 py-8">Loading...</p>
          ) : dailySales ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-5 rounded-xl bg-slate-800/60 border border-slate-700">
                  <p className="text-slate-400 text-sm">Total Cash</p>
                  <p className="text-2xl font-bold text-white">{fmt(dailySales.totalCash)} AED</p>
                </div>
                <div className="p-5 rounded-xl bg-slate-800/60 border border-slate-700">
                  <p className="text-slate-400 text-sm">Total Card</p>
                  <p className="text-2xl font-bold text-white">{fmt(dailySales.totalCard)} AED</p>
                </div>
                <div className="p-5 rounded-xl bg-slate-800/60 border border-slate-700">
                  <p className="text-slate-400 text-sm">Total Sales</p>
                  <p className="text-2xl font-bold text-emerald-400">{fmt(dailySales.totalSales)} AED</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-5 rounded-xl bg-slate-800/60 border border-slate-700">
                  <p className="text-slate-400 text-sm">Total Void</p>
                  <p className="text-xl font-bold text-red-400">{fmt(dailySales.totalVoidAmount)} AED</p>
                </div>
                <div className="p-5 rounded-xl bg-slate-800/60 border border-slate-700">
                  <p className="text-slate-400 text-sm">Refund Total</p>
                  <p className="text-xl font-bold text-red-400">{fmt(dailySales.totalRefundAmount)} AED</p>
                </div>
              </div>

              {dailySales.categorySales.length > 0 && (
                <>
                  <h3 className="text-base font-semibold text-slate-200">Category Sales</h3>
                  <div className="space-y-2">
                    {dailySales.categorySales.map((row) => (
                      <div
                        key={row.categoryId}
                        className="flex justify-between items-center p-4 rounded-lg bg-slate-800/40 border border-slate-700"
                      >
                        <div>
                          <p className="font-medium text-white">{row.categoryName || row.categoryId}</p>
                          <p className="text-slate-500 text-sm">Qty: {row.totalQuantity}</p>
                        </div>
                        <p className="font-bold text-sky-400">{fmt(row.totalAmount)} AED</p>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {dailySales.itemSales.length > 0 && (
                <>
                  <h3 className="text-base font-semibold text-slate-200">Item Sales</h3>
                  <div className="space-y-2">
                    {dailySales.itemSales.slice(0, 20).map((row) => (
                      <div
                        key={row.productId}
                        className="flex justify-between items-center p-4 rounded-lg bg-slate-800/40 border border-slate-700"
                      >
                        <div>
                          <p className="font-medium text-white">{row.productName}</p>
                          <p className="text-slate-500 text-sm">x{row.totalQuantity}</p>
                        </div>
                        <p className="font-bold text-sky-400">{fmt(row.totalAmount)} AED</p>
                      </div>
                    ))}
                    {dailySales.itemSales.length > 20 && (
                      <p className="text-slate-500 text-sm">+{dailySales.itemSales.length - 20} more items</p>
                    )}
                  </div>
                </>
              )}

              {dailySales.voids.length > 0 && (
                <>
                  <h3 className="text-base font-semibold text-slate-200">Void Details</h3>
                  <div className="space-y-2">
                    {dailySales.voids.map((v) => (
                      <div
                        key={v.id}
                        className="p-4 rounded-lg bg-slate-800/40 border border-slate-700"
                      >
                        <div className="flex justify-between">
                          <span className="text-amber-400 font-medium">
                            {v.type === "pre_void" ? "Pre-Void" : v.type === "post_void" ? "Post-Void" : v.type}
                          </span>
                          <span className="text-slate-500 text-sm">
                            {new Date(v.created_at).toLocaleTimeString()}
                          </span>
                        </div>
                        {v.product_name && <p className="text-slate-400 text-sm">{v.product_name} x{v.quantity || 1}</p>}
                        <p className="text-red-400">Amount: {fmt(v.amount || 0)} AED</p>
                        <p className="text-slate-500 text-xs">By: {v.user_name}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {dailySales.refunds.length > 0 && (
                <>
                  <h3 className="text-base font-semibold text-slate-200">Refund Details</h3>
                  <div className="space-y-2">
                    {dailySales.refunds.map((v) => (
                      <div
                        key={v.id}
                        className="p-4 rounded-lg bg-slate-800/40 border border-slate-700"
                      >
                        <div className="flex justify-between">
                          <span className="text-red-400 font-medium">
                            {v.type === "refund_full" ? "Full Bill Refund" : "Refund"}
                          </span>
                          <span className="text-slate-500 text-sm">
                            {new Date(v.created_at).toLocaleTimeString()}
                          </span>
                        </div>
                        {v.product_name && <p className="text-slate-400 text-sm">{v.product_name}</p>}
                        {v.source_table_number && <p className="text-slate-400 text-sm">Table {v.source_table_number}</p>}
                        <p className="text-red-400">Amount: {fmt(v.amount || 0)} AED</p>
                        <p className="text-slate-500 text-xs">By: {v.user_name}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {dailySales.categorySales.length === 0 &&
                dailySales.itemSales.length === 0 &&
                dailySales.voids.length === 0 &&
                dailySales.refunds.length === 0 &&
                dailySales.totalSales === 0 && (
                  <p className="text-slate-500 py-8 text-center">No sales data today yet. Sync from the app to see data.</p>
                )}
            </div>
          ) : (
            <p className="text-slate-500 py-8">Could not load daily sales. Check API connection.</p>
          )}
        </section>
      </main>
    </div>
  );
}
