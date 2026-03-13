"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getUserShiftEvents, type UserShiftEvent } from "@/lib/api";
import { ReportDateFilter, toYYYYMMDD } from "@/components/ReportDateFilter";

function fmtDate(ts: number) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString("en-GB");
  } catch {
    return String(ts);
  }
}

export default function EmployeesPage() {
  const today = toYYYYMMDD(new Date());
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [events, setEvents] = useState<UserShiftEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getUserShiftEvents(dateFrom, dateTo)
      .then((res) => {
        if (!cancelled) setEvents(res.events || []);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setEvents([]);
          setError((e as Error).message || "Failed to load employee shift activity");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dateFrom, dateTo]);

  return (
    <div className="min-h-screen bg-black p-6">
      <header className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <Link href="/" className="p-2 rounded-lg hover:bg-slate-800 text-slate-400">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-sky-400">Employees</h1>
            <p className="text-slate-400 text-sm">Shift in / shift out activity by date range</p>
          </div>
        </div>
        <ReportDateFilter
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
        />
      </header>

      {error && <p className="mb-3 text-sm text-amber-400">{error}</p>}

      {loading ? (
        <p className="text-slate-500">Loading...</p>
      ) : events.length === 0 ? (
        <p className="text-slate-500">No shift in/out activity for this range.</p>
      ) : (
        <div className="rounded-xl border border-slate-700 overflow-hidden bg-slate-900/40">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800/80 border-b border-slate-700">
                <th className="text-left p-3 font-medium text-slate-200">Date / Time</th>
                <th className="text-left p-3 font-medium text-slate-200">Business Day</th>
                <th className="text-left p-3 font-medium text-slate-200">Employee</th>
                <th className="text-left p-3 font-medium text-slate-200">Action</th>
                <th className="text-right p-3 font-medium text-slate-200">Open Tables (at sign-out)</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev, idx) => (
                <tr key={idx} className="border-b border-slate-700/40 hover:bg-slate-800/40">
                  <td className="p-3 text-slate-300 whitespace-nowrap">{fmtDate(ev.ts)}</td>
                  <td className="p-3 text-slate-300">{ev.business_day_key || "—"}</td>
                  <td className="p-3 text-slate-300">{ev.user_name || ev.user_id || "—"}</td>
                  <td className="p-3">
                    <span
                      className={
                        "inline-flex px-2 py-0.5 rounded-full text-xs font-medium " +
                        (ev.action === "user_sign_in"
                          ? "bg-emerald-900/50 text-emerald-200 border border-emerald-700/60"
                          : "bg-slate-900/60 text-slate-200 border border-slate-700/60")
                      }
                    >
                      {ev.action === "user_sign_in" ? "Shift in" : "Shift out"}
                    </span>
                  </td>
                  <td className="p-3 text-right text-slate-300">
                    {ev.action === "user_sign_out" ? (ev.open_tables_count ?? 0) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
