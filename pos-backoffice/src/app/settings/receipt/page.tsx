"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSettings, updateSettings } from "@/lib/api";

export default function ReceiptSettingsPage() {
  const [companyName, setCompanyName] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [receiptHeader, setReceiptHeader] = useState("BILL / RECEIPT");
  const [receiptFooterMessage, setReceiptFooterMessage] = useState("Thank you!");
  const [receiptItemSize, setReceiptItemSize] = useState<number>(0);
  const [kitchenHeader, setKitchenHeader] = useState("KITCHEN");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const s = await getSettings();
      setCompanyName(s.company_name ?? "");
      setCompanyAddress(s.company_address ?? "");
      setReceiptHeader(s.receipt_header ?? "BILL / RECEIPT");
      setReceiptFooterMessage(s.receipt_footer_message ?? "Thank you!");
      setReceiptItemSize(Math.min(2, Math.max(0, (s.receipt_item_size ?? 0) | 0)));
      setKitchenHeader(s.kitchen_header ?? "KITCHEN");
    } catch {
      window.location.href = "/login";
    } finally {
      setLoading(false);
    }
  }

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      await updateSettings({
        company_name: companyName,
        company_address: companyAddress,
        receipt_header: receiptHeader || "BILL / RECEIPT",
        receipt_footer_message: receiptFooterMessage || "Thank you!",
        receipt_item_size: receiptItemSize,
        kitchen_header: kitchenHeader || "KITCHEN",
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
          <h1 className="text-xl font-bold text-sky-400">Customer Receipt & Kitchen Receipt</h1>
          <p className="text-slate-400 text-sm">Company info, receipt message and kitchen receipt header</p>
        </div>
      </header>

      <main className="p-6 max-w-2xl">
        <form onSubmit={save} className="space-y-6">
          {/* Müşteri Fişi / Bill */}
          <div className="rounded-xl bg-slate-800/50 border border-slate-700 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Customer Receipt (Bill)</h2>

            <label className="block text-sm text-slate-300 mb-2">Company / Business name</label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="e.g. Limon Restaurant"
              maxLength={200}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white mb-4 placeholder-slate-500"
            />

            <label className="block text-sm text-slate-300 mb-2">Address</label>
            <textarea
              value={companyAddress}
              onChange={(e) => setCompanyAddress(e.target.value)}
              placeholder="e.g. Main St. No:1, Downtown"
              maxLength={400}
              rows={3}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white mb-4 placeholder-slate-500 resize-none"
            />

            <label className="block text-sm text-slate-300 mb-2">Receipt header</label>
            <input
              type="text"
              value={receiptHeader}
              onChange={(e) => setReceiptHeader(e.target.value)}
              placeholder="BILL / RECEIPT"
              maxLength={100}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white mb-4 placeholder-slate-500"
            />

            <label className="block text-sm text-slate-300 mb-2">Receipt item size</label>
            <div className="flex gap-3 mb-4">
              {[
                { value: 0, label: "Normal" },
                { value: 1, label: "Large" },
                { value: 2, label: "XLarge" },
              ].map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="receiptItemSize"
                    checked={receiptItemSize === opt.value}
                    onChange={() => setReceiptItemSize(opt.value)}
                    className="text-sky-500"
                  />
                  <span className="text-slate-300">{opt.label}</span>
                </label>
              ))}
            </div>
            <p className="text-slate-500 text-xs mb-4">Fişteki ürün satırlarının font boyutu (uygulama sync ile güncellenir)</p>

            <label className="block text-sm text-slate-300 mb-2">Receipt footer message</label>
            <textarea
              value={receiptFooterMessage}
              onChange={(e) => setReceiptFooterMessage(e.target.value)}
              placeholder="Thank you!"
              maxLength={300}
              rows={2}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 resize-none"
            />
          </div>

          {/* Mutfak Fişi */}
          <div className="rounded-xl bg-slate-800/50 border border-slate-700 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Kitchen Receipt</h2>

            <label className="block text-sm text-slate-300 mb-2">Kitchen receipt header</label>
            <input
              type="text"
              value={kitchenHeader}
              onChange={(e) => setKitchenHeader(e.target.value)}
              placeholder="KITCHEN / MUTFAK"
              maxLength={100}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500"
            />
            <p className="text-slate-500 text-xs mt-2">
              Shown at the top of the receipt sent to the kitchen printer.
            </p>
          </div>

          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 rounded-lg text-white font-medium"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            {saved && <span className="text-green-400">Saved.</span>}
          </div>
        </form>
      </main>
    </div>
  );
}
