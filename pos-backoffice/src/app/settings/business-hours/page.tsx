"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSettings, updateSettings } from "@/lib/api";
import type { Settings } from "@/lib/api";

const HHMM_REGEX = /^\d{1,2}:\d{2}$/;
function validateHHMM(v: string): boolean {
  if (!v || !HHMM_REGEX.test(v.trim())) return false;
  const [h, m] = v.trim().split(":").map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

export default function BusinessHoursSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    opening_time: "07:00",
    closing_time: "01:30",
    open_tables_warning_time: "01:00",
    auto_close_open_tables: false,
    auto_close_payment_method: "cash",
    grace_minutes: 0,
    warning_enabled: true,
  });

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const s = await getSettings();
      setSettings(s);
      setForm({
        opening_time: s.opening_time ?? "07:00",
        closing_time: s.closing_time ?? "01:30",
        open_tables_warning_time: s.open_tables_warning_time ?? "01:00",
        auto_close_open_tables: !!s.auto_close_open_tables,
        auto_close_payment_method: s.auto_close_payment_method ?? "cash",
        grace_minutes: Math.min(60, Math.max(0, s.grace_minutes ?? 0)),
        warning_enabled: s.warning_enabled !== false,
      });
    } catch {
      window.location.href = "/login";
    } finally {
      setLoading(false);
    }
  }

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    if (!validateHHMM(form.opening_time) || !validateHHMM(form.closing_time) || !validateHHMM(form.open_tables_warning_time)) {
      alert("Opening, Closing and Warning time must be HH:mm format (e.g. 07:00, 01:30).");
      return;
    }
    setSaving(true);
    setSaved(false);
    try {
      await updateSettings({
        opening_time: form.opening_time,
        closing_time: form.closing_time,
        open_tables_warning_time: form.open_tables_warning_time,
        auto_close_open_tables: form.auto_close_open_tables,
        auto_close_payment_method: form.auto_close_payment_method,
        grace_minutes: form.grace_minutes,
        warning_enabled: form.warning_enabled,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-800 bg-slate-900 px-6 py-4 flex items-center gap-4">
        <Link href="/settings" className="p-2 rounded-lg hover:bg-slate-800 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-sky-400">Business Hours & End of Day</h1>
          <p className="text-slate-400 text-sm">Opening, closing, warning time, auto-close open tables</p>
        </div>
      </header>

      <main className="p-6 max-w-xl space-y-6">
        <div className="rounded-xl bg-slate-800/50 border border-slate-700 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Business Day Times</h2>
          <p className="text-slate-400 text-sm mb-4">
            Opening–Closing defines the business day. Cross-midnight supported (e.g. 07:00–01:30 = one day). All reports and dashboard use business day.
          </p>
          <div className="grid gap-4">
            <div>
              <label className="block text-sm text-slate-300 mb-1">Opening Time</label>
              <input
                type="text"
                placeholder="07:00"
                value={form.opening_time}
                onChange={(e) => setForm((f) => ({ ...f, opening_time: e.target.value }))}
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1">Closing Time</label>
              <input
                type="text"
                placeholder="01:30"
                value={form.closing_time}
                onChange={(e) => setForm((f) => ({ ...f, closing_time: e.target.value }))}
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1">Open Tables Warning Time</label>
              <input
                type="text"
                placeholder="01:00"
                value={form.open_tables_warning_time}
                onChange={(e) => setForm((f) => ({ ...f, open_tables_warning_time: e.target.value }))}
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white"
              />
              <p className="text-slate-500 text-xs mt-1">When this time is reached, supervisors see a warning to close open tables.</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-slate-800/50 border border-slate-700 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Warning</h2>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.warning_enabled}
              onChange={(e) => setForm((f) => ({ ...f, warning_enabled: e.target.checked }))}
              className="rounded"
            />
            <span className="text-slate-200">Warning enabled</span>
          </label>
          <p className="text-slate-500 text-xs mt-1">Show &quot;Close open tables&quot; warning to supervisors at warning time.</p>
        </div>

        <div className="rounded-xl bg-slate-800/50 border border-slate-700 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Auto-Close Open Tables</h2>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.auto_close_open_tables}
              onChange={(e) => setForm((f) => ({ ...f, auto_close_open_tables: e.target.checked }))}
              className="rounded"
            />
            <span className="text-slate-200">Auto-close open tables at close time</span>
          </label>
          <p className="text-slate-500 text-xs mt-2">
            When closing time + grace passes, system will automatically close any open tables with CASH payment.
          </p>
          {form.auto_close_open_tables && (
            <>
              <div className="mt-4">
                <label className="block text-sm text-slate-300 mb-1">Auto-close payment method</label>
                <select
                  value={form.auto_close_payment_method}
                  onChange={(e) => setForm((f) => ({ ...f, auto_close_payment_method: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white"
                >
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                </select>
              </div>
              <div className="mt-4">
                <label className="block text-sm text-slate-300 mb-1">Grace minutes (0–60)</label>
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={form.grace_minutes}
                  onChange={(e) => setForm((f) => ({ ...f, grace_minutes: Math.min(60, Math.max(0, parseInt(e.target.value, 10) || 0)) }))}
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white"
                />
                <p className="text-slate-500 text-xs mt-1">Minutes after closing before auto-close runs.</p>
              </div>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 rounded-lg text-white font-medium"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        {saved && <span className="ml-3 text-green-400">Saved.</span>}
      </main>
    </div>
  );
}
