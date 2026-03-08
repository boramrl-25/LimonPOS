"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Mail } from "lucide-react";
import { getDailySales } from "@/lib/api";
import { ReportDateFilter, toYYYYMMDD } from "@/components/ReportDateFilter";

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function RefundsReportPage() {
  const today = toYYYYMMDD(new Date());
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const single = dateFrom === dateTo ? dateFrom : undefined;
    getDailySales(single, dateFrom, dateTo).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [dateFrom, dateTo]);

  const refunds = (data as { refunds?: Array<{ id: string; type: string; product_name?: string; amount: number; user_name: string; source_table_number?: string; created_at?: number }> })?.refunds ?? [];
  const totalRefund = (data as { totalRefundAmount?: number })?.totalRefundAmount ?? 0;

  function exportExcel() {
    if (!refunds.length) { alert("No data to export"); return; }
    const headers = ["Type", "Amount (AED)", "Table", "By", "Date"];
    const rows = refunds.map((r) => [r.type, fmt(r.amount), r.source_table_number || "-", r.user_name, r.created_at ? new Date(r.created_at).toLocaleString("en-GB") : "-"]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "refunds-report-" + dateFrom + "-" + dateTo + ".csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="min-h-screen bg-black p-6">
      <header className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="p-2 rounded-lg hover:bg-slate-800 text-slate-400"><ArrowLeft className="w-5 h-5" /></Link>
          <div>
            <h1 className="text-xl font-bold text-sky-400">Refund Report</h1>
            <p className="text-slate-400 text-sm">Export to Excel · Email</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ReportDateFilter dateFrom={dateFrom} dateTo={dateTo} onDateFromChange={setDateFrom} onDateToChange={setDateTo} />
          <button type="button" onClick={exportExcel} disabled={!refunds.length} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"><Download className="w-4 h-4" /> Export Excel (CSV)</button>
          <button type="button" className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200"><Mail className="w-4 h-4" /> Email</button>
        </div>
      </header>
      {loading ? <p className="text-slate-500">Loading...</p> : data ? (
        <div className="rounded-xl border border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800/80 border-b border-slate-700">
                <th className="text-left p-4 font-medium text-slate-200">Type</th>
                <th className="text-right p-4 font-medium text-slate-200">Amount (AED)</th>
                <th className="text-left p-4 font-medium text-slate-200">Table</th>
                <th className="text-left p-4 font-medium text-slate-200">By</th>
                <th className="text-left p-4 font-medium text-slate-200">Date</th>
              </tr>
            </thead>
            <tbody>
              {refunds.map((r) => (
                <tr key={r.id} className="border-b border-slate-700/50">
                  <td className="p-4 text-red-400">{r.type}</td>
                  <td className="p-4 text-right text-red-400">{fmt(r.amount)}</td>
                  <td className="p-4 text-slate-300">{r.source_table_number || "-"}</td>
                  <td className="p-4 text-slate-400">{r.user_name}</td>
                  <td className="p-4 text-slate-400">{r.created_at ? new Date(r.created_at).toLocaleString("en-GB") : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-4 bg-slate-800/60 border-t border-slate-700 text-slate-200">
            Total Refunds: <strong className="text-red-400">{fmt(totalRefund)} AED</strong>
          </div>
        </div>
      ) : <p className="text-slate-500">No data</p>}
    </div>
  );
}
