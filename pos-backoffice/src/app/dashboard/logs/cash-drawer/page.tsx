"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function CashDrawerLogPage() {
  const logs = [
    { id: "1", user: "Manager", action: "Cash drawer opened (no sale)", time: "9:00 AM" },
    { id: "2", user: "Sara", action: "Cash drawer opened (no sale)", time: "12:30 PM" },
  ];

  return (
    <div className="p-6">
      <Link href="/dashboard" className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </Link>

      <h1 className="text-2xl font-bold text-sky-400 mb-2">Cash Drawer Opens (No Sale)</h1>
      <p className="text-slate-400 mb-8">Log of cash drawer opens without a sale</p>

      <div className="rounded-lg border border-slate-700 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-800/50 border-b border-slate-700">
              <th className="text-left p-4 font-medium">ID</th>
              <th className="text-left p-4 font-medium">User</th>
              <th className="text-left p-4 font-medium">Action</th>
              <th className="text-left p-4 font-medium">Time</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-b border-slate-700/50">
                <td className="p-4">{log.id}</td>
                <td className="p-4">{log.user}</td>
                <td className="p-4">{log.action}</td>
                <td className="p-4">{log.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
