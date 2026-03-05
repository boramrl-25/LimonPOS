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

export default function SalesReportPage() {
  const [date, setDate] = useState(toYYYYMMDD(new Date()));
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getDailySales(date).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [date]);

  const paidTickets = (data as { paidTickets?: Array<{ order_id: string; receipt_no?: string; table_number: string; total: number; paid_at: number; waiter_name?: string }> })?.paidTickets ?? [];
  const totalSales = (data as { totalSales?: number })?.totalSales ?? 0;
  const totalCash = (data as { totalCash?: number })?.totalCash ?? 0;
  const totalCard = (data as { totalCard?: number })?.totalCard ?? 0;

  function exportExcel() {
    if (!paidTickets.length) { alert("No data to export"); return; }
    const headers = ["Receipt #", "Table", "Total (AED)", "Date", "By"];
    const rows = paidTickets.map((t) => [t.receipt_no || t.order_id, t.table_number, fmt(t.total), new Date(t.paid_at).toLocaleString("en-GB"), t.waiter_name || "-"]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "sales-report-" + date + ".csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <header className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="p-2 rounded-lg hover:bg-slate-800 text-slate-400"><ArrowLeft className="w-5 h-5" /></Link>
          <div>
            <h1 className="text-xl font-bold text-sky-400">Sales Report</h1>
            <p className="text-slate-400 text-sm">Export to Excel · Email</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={date} max={toYYYYMMDD(new Date())} onChange={(e) => setDate(e.target.value)} className="px-3 py-2 rounded-lg bg-slate-800 text-slate-200 border border-slate-600" />
          <button type="button" onClick={exportExcel} disabled={!paidTickets.length} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"><Download className="w-4 h-4" /> Export Excel (CSV)</button>
          <button type="button" className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200"><Mail className="w-4 h-4" /> Email</button>
        </div>
      </header>
      {loading ? <p className="text-slate-500">Loading...</p> : data ? (
        <div className="rounded-xl border border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800/80 border-b border-slate-700">
                <th className="text-left p-4 font-medium text-slate-200">Receipt #</th>
                <th className="text-left p-4 font-medium text-slate-200">Table</th>
                <th className="text-right p-4 font-medium text-slate-200">Total (AED)</th>
                <th className="text-left p-4 font-medium text-slate-200">Date</th>
                <th className="text-left p-4 font-medium text-slate-200">By</th>
              </tr>
            </thead>
            <tbody>
              {paidTickets.map((t) => (
                <tr key={t.order_id} className="border-b border-slate-700/50">
                  <td className="p-4 text-slate-300">{t.receipt_no || t.order_id}</td>
                  <td className="p-4 text-slate-300">{t.table_number}</td>
                  <td className="p-4 text-right text-emerald-400">{fmt(t.total)}</td>
                  <td className="p-4 text-slate-400">{new Date(t.paid_at).toLocaleString("en-GB")}</td>
                  <td className="p-4 text-slate-400">{t.waiter_name || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-4 bg-slate-800/60 border-t border-slate-700 flex justify-between text-slate-200">
            <span>Total Sales: <strong className="text-emerald-400">{fmt(totalSales)} AED</strong></span>
            <span>Cash: {fmt(totalCash)} · Card: {fmt(totalCard)}</span>
          </div>
        </div>
      ) : <p className="text-slate-500">No data</p>}
    </div>
  );
}
