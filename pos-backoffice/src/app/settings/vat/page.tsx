"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSettings, updateSettings } from "@/lib/api";

export default function VatSettingsPage() {
  const [vatPercent, setVatPercent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const s = await getSettings();
      setVatPercent(s.vat_percent ?? 0);
    } catch {
      window.location.href = "/login";
    } finally {
      setLoading(false);
    }
  }

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    const v = Math.round(Number(vatPercent) || 0);
    if (v < 0 || v > 100) {
      alert("VAT must be between 0 and 100%.");
      return;
    }
    setSaving(true);
    setSaved(false);
    try {
      await updateSettings({ vat_percent: v });
      setVatPercent(v);
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
          <ArrowLeft className="w-5 h-5 text-slate-300" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-sky-400">VAT</h1>
          <p className="text-slate-400 text-sm">
            Global VAT rate applied to all products. Set to 0 for no tax.
          </p>
        </div>
      </header>

      <main className="p-6 max-w-xl">
        <form onSubmit={save} className="space-y-6">
          <div className="p-5 rounded-xl bg-slate-800/60 border border-slate-700">
            <label className="block text-slate-400 text-sm mb-2">VAT (%)</label>
            <input
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={vatPercent}
              onChange={(e) => setVatPercent(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white"
            />
            <p className="text-slate-500 text-xs mt-2">
              Applied to all products. E.g. 18 for 18% VAT.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-medium"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            {saved && (
              <span className="text-emerald-400 text-sm py-2">Saved</span>
            )}
          </div>
        </form>
      </main>
    </div>
  );
}
