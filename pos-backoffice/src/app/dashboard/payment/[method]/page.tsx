"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

export default function PaymentDetailPage() {
  const params = useParams();
  const method = (params.method as string) || "cash";
  const txs = [{ id: 1, amount: 45, time: "10:32 AM" }, { id: 2, amount: 89.5, time: "11:15 AM" }];

  return (
    <div className="p-6">
      <Link href="/dashboard" className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </Link>
      <h1 className="text-2xl font-bold text-sky-400 mb-2">{method.charAt(0).toUpperCase() + method.slice(1)} Transactions</h1>
      <div className="rounded-lg border border-slate-700 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-800/50 border-b border-slate-700">
              <th className="text-left p-4 font-medium">ID</th>
              <th className="text-left p-4 font-medium">Amount (AED)</th>
              <th className="text-left p-4 font-medium">Time</th>
            </tr>
          </thead>
          <tbody>
            {txs.map((t) => (
              <tr key={t.id} className="border-b border-slate-700/50">
                <td className="p-4">{t.id}</td>
                <td className="p-4">{t.amount}</td>
                <td className="p-4">{t.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
