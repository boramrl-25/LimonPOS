"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

function ReportsContent() {
  const searchParams = useSearchParams();
  const type = searchParams.get("type") || "sales";
  const method = searchParams.get("method");
  const kind = searchParams.get("kind");

  const titles: Record<string, string> = {
    sales: "Today's Sales Details",
    orders: "Order Count Details",
    tables: "Open Tables Details",
    checks: "Open Checks Details",
    payment: `${(method || "cash").charAt(0).toUpperCase() + (method || "cash").slice(1)} Transactions`,
    voids: kind === "top-users" ? "Top Void Users" : `${kind === "pre-print" ? "Pre-Print" : "Post-Print"} Voids`,
  };

  const title = type === "payment" ? titles.payment : type === "voids" ? titles.voids : titles[type] || "Report Details";

  const sampleData = type === "voids" && kind === "top-users"
    ? [{ user: "Ahmed", count: 12 }, { user: "Sara", count: 5 }]
    : type === "payment" || type === "payment"
    ? [{ id: 1, amount: 45, time: "10:32 AM" }, { id: 2, amount: 89.5, time: "11:15 AM" }]
    : [{ id: "T001", table: "5", total: 45, time: "10:32 AM" }, { id: "T002", table: "12", total: 89.5, time: "11:15 AM" }];

  return (
    <div className="p-6">
      <Link href="/dashboard" className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </Link>
      <h1 className="text-2xl font-bold text-sky-400 mb-2">{title}</h1>
      <p className="text-slate-400 mb-8">Drill-down view</p>

      {type === "voids" && kind === "top-users" ? (
        <div className="rounded-lg border border-slate-700 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-800/50 border-b border-slate-700">
                <th className="text-left p-4 font-medium">User</th>
                <th className="text-left p-4 font-medium">Void Count</th>
              </tr>
            </thead>
            <tbody>
              {(sampleData as { user: string; count: number }[]).map((r, i) => (
                <tr key={i} className="border-b border-slate-700/50">
                  <td className="p-4">{r.user}</td>
                  <td className="p-4">{r.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-700 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-800/50 border-b border-slate-700">
                <th className="text-left p-4 font-medium">ID</th>
                {type === "payment" ? (
                  <>
                    <th className="text-left p-4 font-medium">Amount (AED)</th>
                    <th className="text-left p-4 font-medium">Time</th>
                  </>
                ) : (
                  <>
                    <th className="text-left p-4 font-medium">Table</th>
                    <th className="text-left p-4 font-medium">Total (AED)</th>
                    <th className="text-left p-4 font-medium">Time</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {(sampleData as { id: number | string; table?: string; total?: number; amount?: number; time: string }[]).map((r, i) => (
                <tr key={i} className="border-b border-slate-700/50">
                  <td className="p-4">{r.id}</td>
                  {type === "payment" ? (
                    <>
                      <td className="p-4">{(r.amount ?? r.total ?? 0).toFixed(2)}</td>
                      <td className="p-4">{r.time}</td>
                    </>
                  ) : (
                    <>
                      <td className="p-4">{r.table ?? "-"}</td>
                      <td className="p-4">{(r.total ?? r.amount ?? 0).toFixed(2)}</td>
                      <td className="p-4">{r.time}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function ReportsDrillDownPage() {
  return (
    <Suspense fallback={<div className="p-6 text-slate-400">Loading...</div>}>
      <ReportsContent />
    </Suspense>
  );
}
