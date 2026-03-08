"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Mail } from "lucide-react";
import { getDailySales } from "@/lib/api";
import { ReportDateFilter, toYYYYMMDD } from "@/components/ReportDateFilter";

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function DailySummaryReportPage() {
  const today = toYYYYMMDD(new Date());
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [data, setData] = useState<{
    totalSales: number;
    totalCash: number;
    totalCard: number;
    totalVoidAmount: number;
    totalRefundAmount: number;
    netSales?: number;
    categorySales: Array<{ categoryName: string; totalAmount: number; totalQuantity: number }>;
    itemSales: Array<{ productName: string; totalAmount: number; totalQuantity: number }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const single = dateFrom === dateTo ? dateFrom : undefined;
    getDailySales(single, dateFrom, dateTo)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [dateFrom, dateTo]);

  function exportExcel() {
    if (!data) {
      alert("No data to export");
      return;
    }
    const rangeLabel = dateFrom === dateTo ? dateFrom : `${dateFrom} – ${dateTo}`;
    const lines = [
      ["Daily Summary Report", rangeLabel],
      [],
      ["Total Sales (AED)", fmt(data.totalSales ?? 0)],
      ["Total Cash (AED)", fmt(data.totalCash ?? 0)],
      ["Total Card (AED)", fmt(data.totalCard ?? 0)],
      ["Total Void (AED)", fmt(data.totalVoidAmount ?? 0)],
      ["Total Refund (AED)", fmt(data.totalRefundAmount ?? 0)],
      ["Net Sales (AED)", fmt(data.netSales ?? data.totalSales ?? 0)],
      [],
      ["Category Sales"],
      ["Category", "Amount (AED)", "Qty"],
      ...(data.categorySales || []).map((r) => [r.categoryName, fmt(r.totalAmount), r.totalQuantity]),
      [],
      ["Product Sales"],
      ["Product", "Amount (AED)", "Qty"],
      ...(data.itemSales || []).map((r) => [r.productName, fmt(r.totalAmount), r.totalQuantity]),
    ];
    const csv = lines.map((row) => (Array.isArray(row) ? row : [row]).map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `daily-summary-${dateFrom}-${dateTo}.csv`;
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
            <h1 className="text-xl font-bold text-sky-400">Daily Summary Report</h1>
            <p className="text-slate-400 text-sm">Export to Excel · Email</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ReportDateFilter dateFrom={dateFrom} dateTo={dateTo} onDateFromChange={setDateFrom} onDateToChange={setDateTo} />
          <button type="button" onClick={exportExcel} disabled={!data} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 shrink-0">
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
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700">
              <p className="text-slate-400 text-sm">Total Sales</p>
              <p className="text-xl font-bold text-emerald-400">{fmt(data.totalSales ?? 0)} AED</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700">
              <p className="text-slate-400 text-sm">Cash</p>
              <p className="text-xl font-bold text-white">{fmt(data.totalCash ?? 0)} AED</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700">
              <p className="text-slate-400 text-sm">Void</p>
              <p className="text-xl font-bold text-red-400">{fmt(data.totalVoidAmount ?? 0)} AED</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700">
              <p className="text-slate-400 text-sm">Net</p>
              <p className="text-xl font-bold text-sky-400">{fmt(data.netSales ?? data.totalSales ?? 0)} AED</p>
            </div>
          </div>
          {data.categorySales?.length > 0 && (
            <div className="rounded-xl border border-slate-700 overflow-hidden">
              <h2 className="p-4 bg-slate-800/80 text-slate-200 font-semibold">Category Sales</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-800/60 border-b border-slate-700">
                    <th className="text-left p-4 font-medium text-slate-200">Category</th>
                    <th className="text-right p-4 font-medium text-slate-200">Amount (AED)</th>
                    <th className="text-right p-4 font-medium text-slate-200">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {data.categorySales.map((r, i) => (
                    <tr key={i} className="border-b border-slate-700/50">
                      <td className="p-4 text-slate-300">{r.categoryName}</td>
                      <td className="p-4 text-right text-sky-400">{fmt(r.totalAmount)}</td>
                      <td className="p-4 text-right text-slate-400">{r.totalQuantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <p className="text-slate-500">No data</p>
      )}
    </div>
  );
}
