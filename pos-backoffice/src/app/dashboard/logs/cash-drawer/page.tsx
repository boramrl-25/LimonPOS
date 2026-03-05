"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCashDrawerOpens } from "@/lib/api";

export default function CashDrawerLogPage() {
  const [data, setData] = useState<{ count: number; opens: Array<{ id: string; user_name: string; opened_at: number }> } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCashDrawerOpens()
      .then(setData)
      .catch(() => setData({ count: 0, opens: [] }))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6">
      <Link href="/" className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </Link>

      <h1 className="text-2xl font-bold text-sky-400 mb-2">Cash Drawer Opens (No Sale)</h1>
      <p className="text-slate-400 mb-8">Who opened the cash drawer and when (no sale). Also on Dashboard as a block.</p>

      {loading ? (
        <p className="text-slate-500">Loading...</p>
      ) : (
        <div className="rounded-lg border border-slate-700 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-800/50 border-b border-slate-700">
                <th className="text-left p-4 font-medium">User</th>
                <th className="text-left p-4 font-medium">Date & time</th>
              </tr>
            </thead>
            <tbody>
              {data && data.opens.length > 0 ? (
                data.opens.map((e) => (
                  <tr key={e.id} className="border-b border-slate-700/50">
                    <td className="p-4">{e.user_name}</td>
                    <td className="p-4">{new Date(e.opened_at).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "medium" })}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={2} className="p-8 text-center text-slate-500">No cash drawer opens (no sale) for today.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
