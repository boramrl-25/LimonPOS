"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw, BarChart3, Moon } from "lucide-react";
import { getDailySales, runEod } from "@/lib/api";

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatEodTime(ts: number) {
  return new Date(ts).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });
}

type DailySalesData = {
  totalCash: number;
  totalCard: number;
  totalSales: number;
  netSales?: number;
  totalVoidAmount: number;
  totalRefundAmount: number;
  categorySales: Array<{ categoryId: string; categoryName: string; totalAmount: number; totalQuantity: number }>;
  itemSales: Array<{ productId: string; productName: string; totalAmount: number; totalQuantity: number }>;
  voids: Array<{ id: string; type: string; product_name: string; quantity: number; amount: number; user_name: string; created_at: number }>;
  refunds: Array<{ id: string; type: string; product_name?: string; amount: number; user_name: string; source_table_number?: string; created_at: number }>;
  lastEod?: { ran_at: number; user_name: string; tables_closed_count: number } | null;
  openTablesCount?: number;
};

export default function DailySalesPage() {
  const [data, setData] = useState<DailySalesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [eodRunning, setEodRunning] = useState(false);
  const [eodConfirmOpen, setEodConfirmOpen] = useState(false);

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
            {/* Summary Cards */}
            <section>
              <h2 className="text-lg font-semibold text-slate-200 mb-4">Today&apos;s Summary</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
                <div className="p-5 rounded-xl bg-slate-800/60 border border-slate-700">
                  <p className="text-slate-400 text-sm">Cash</p>
                  <p className="text-2xl font-bold text-white">{fmt(data.totalCash)}</p>
                </div>
                <div className="p-5 rounded-xl bg-slate-800/60 border border-slate-700">
                  <p className="text-slate-400 text-sm">Card</p>
                  <p className="text-2xl font-bold text-white">{fmt(data.totalCard)}</p>
                </div>
                <div className="p-5 rounded-xl bg-slate-800/60 border border-slate-700">
                  <p className="text-slate-400 text-sm">Total Sales</p>
                  <p className="text-2xl font-bold text-emerald-400">{fmt(data.totalSales)}</p>
                </div>
                {typeof data.netSales === "number" && (
                  <div className="p-5 rounded-xl bg-slate-800/60 border border-slate-700">
                    <p className="text-slate-400 text-sm">Net (iade düşülmüş)</p>
                    <p className="text-2xl font-bold text-sky-400">{fmt(data.netSales)}</p>
                  </div>
                )}
                <div className="p-5 rounded-xl bg-slate-800/60 border border-slate-700">
                  <p className="text-slate-400 text-sm">Total Void</p>
                  <p className="text-xl font-bold text-red-400">{fmt(data.totalVoidAmount)}</p>
                </div>
                <div className="p-5 rounded-xl bg-slate-800/60 border border-slate-700">
                  <p className="text-slate-400 text-sm">Total Refunds</p>
                  <p className="text-xl font-bold text-red-400">{fmt(data.totalRefundAmount)}</p>
                </div>
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
