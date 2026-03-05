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

export default function VoidsReportPage() {
  const [date, setDate] = useState(toYYYYMMDD(new Date()));
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getDailySales(date)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [date]);

  const voids = (data as { voids?: Array<{ id: string; type: string; product_name: string; quantity: number; amount: number; user_name: string; created_at: number; order_id?: string }> })?.voids ?? [];
  const totalVoidAmount = (data as { totalVoidAmount?: number })?.totalVoidAmount ?? 0;

  function exportExcel() {
    if (!voids.length) {
      alert("No data to export");
      return;
    }
    const headers = ["Type", "Product", "Qty", "Amount (AED)", "Date", "By", "Order ID"];
    const rows = voids.map((v) => [v.type, v.product_name || "-", v.quantity, fmt(v.amount || 0), new Date(v.created_at).toLocaleString("en-GB"), v.user_name, v.order_id || "-"]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "voids-report-" + date + ".csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="min-h-screen bg-black p-6">
      <header className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="p-2 rounded-lg hover:bg-slate-800 text-slate-400">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-sky-400">Void Report</h1>
            <p className="text-slate-400 text-sm">Export to Excel · Email</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={date} max={toYYYYMMDD(new Date())} onChange={(e) => setDate(e.target.value)} className="px-3 py-2 rounded-lg bg-slate-800 text-slate-200 border border-slate-600" />
          <button type="button" onClick={exportExcel} disabled={!voids.length} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50">
            <Download className="w-4 h-4" /> Export Excel (CSV)
          </button>
          <button type="button" className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200">
            <Mail className="w-4 h-4" /> Email
          </button>
        </div>
      </header>

      {loading ? (
        <p className="text-slate-500">Loading...</p>
      ) : data ? (
        <div className="rounded-xl border border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800/80 border-b border-slate-700">
                <th className="text-left p-4 font-medium text-slate-200">Type</th>
                <th className="text-left p-4 font-medium text-slate-200">Product</th>
                <th className="text-right p-4 font-medium text-slate-200">Qty</th>
                <th className="text-right p-4 font-medium text-slate-200">Amount (AED)</th>
                <th className="text-left p-4 font-medium text-slate-200">Date</th>
                <th className="text-left p-4 font-medium text-slate-200">By</th>
              </tr>
            </thead>
            <tbody>
              {voids.map((v) => (
                <tr key={v.id} className="border-b border-slate-700/50 hover:bg-slate-800/40">
                  <td className="p-4 text-amber-400">{v.type}</td>
                  <td className="p-4 text-slate-300">{v.product_name || "-"}</td>
                  <td className="p-4 text-right text-slate-300">{v.quantity}</td>
                  <td className="p-4 text-right text-red-400">{fmt(v.amount || 0)}</td>
                  <td className="p-4 text-slate-400">{new Date(v.created_at).toLocaleString("en-GB")}</td>
                  <td className="p-4 text-slate-400">{v.user_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-4 bg-slate-800/60 border-t border-slate-700 text-slate-200">
            Total Void Amount: <strong className="text-red-400">{fmt(totalVoidAmount)} AED</strong>
          </div>
        </div>
      ) : (
        <p className="text-slate-500">No data</p>
      )}
    </div>
  );
}
