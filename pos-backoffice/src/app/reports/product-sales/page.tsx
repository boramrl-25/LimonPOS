"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Mail } from "lucide-react";
import { getDailySales } from "@/lib/api";

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function toYYYYMMDD(d: Date) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

export default function ProductSalesReportPage() {
  const [date, setDate] = useState(toYYYYMMDD(new Date()));
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getDailySales(date).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [date]);

  const itemSales = (data as { itemSales?: Array<{ productId: string; productName: string; totalAmount: number; totalQuantity: number }> })?.itemSales ?? [];

  function exportExcel() {
    if (!itemSales.length) { alert("No data to export"); return; }
    const headers = ["Product", "Amount (AED)", "Quantity"];
    const rows = itemSales.map((r) => [r.productName || r.productId, fmt(r.totalAmount), r.totalQuantity]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "product-sales-" + date + ".csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="min-h-screen bg-black p-6">
      <header className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="p-2 rounded-lg hover:bg-slate-800 text-slate-400"><ArrowLeft className="w-5 h-5" /></Link>
          <div>
            <h1 className="text-xl font-bold text-sky-400">Product Sales Report</h1>
            <p className="text-slate-400 text-sm">Export to Excel · Email</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={date} max={toYYYYMMDD(new Date())} onChange={(e) => setDate(e.target.value)} className="px-3 py-2 rounded-lg bg-slate-800 text-slate-200 border border-slate-600" />
          <button type="button" onClick={exportExcel} disabled={!itemSales.length} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"><Download className="w-4 h-4" /> Export Excel (CSV)</button>
          <button type="button" className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200"><Mail className="w-4 h-4" /> Email</button>
        </div>
      </header>
      {loading ? <p className="text-slate-500">Loading...</p> : data ? (
        <div className="rounded-xl border border-slate-700 overflow-hidden max-h-[70vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800/80 border-b border-slate-700 sticky top-0">
                <th className="text-left p-4 font-medium text-slate-200">Product</th>
                <th className="text-right p-4 font-medium text-slate-200">Amount (AED)</th>
                <th className="text-right p-4 font-medium text-slate-200">Quantity</th>
              </tr>
            </thead>
            <tbody>
              {itemSales.map((r) => (
                <tr key={r.productId} className="border-b border-slate-700/50">
                  <td className="p-4 text-slate-300">{r.productName || r.productId}</td>
                  <td className="p-4 text-right text-sky-400">{fmt(r.totalAmount)}</td>
                  <td className="p-4 text-right text-slate-400">{r.totalQuantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="text-slate-500">No data</p>}
    </div>
  );
}
