"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Mail, RefreshCw, Percent, Plus, Trash2 } from "lucide-react";
import { getReconciliationInboxConfig, updateReconciliationInboxConfig, fetchReconciliationNow, getReconciliationBankSettings, updateReconciliationBankSettings, getReconciliationBankAccounts, updateReconciliationBankAccounts } from "@/lib/api";

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ReconciliationSettingsPage() {
  const [host, setHost] = useState("imap.gmail.com");
  const [port, setPort] = useState(993);
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);
  const [defaultPercentage, setDefaultPercentage] = useState(1.9);
  const [cardTypes, setCardTypes] = useState<Array<{ name: string; percentage: number }>>([{ name: "CREDIT PREMIUM", percentage: 2 }, { name: "INTERNATIONAL CARDS", percentage: 1.5 }]);
  const [bankSaving, setBankSaving] = useState(false);
  const [cardAccount, setCardAccount] = useState("");
  const [cashAccount, setCashAccount] = useState("");
  const [accountsSaving, setAccountsSaving] = useState(false);

  useEffect(() => {
    getReconciliationInboxConfig()
      .then((r) => setConfigured(r.configured))
      .catch(() => {});
    getReconciliationBankSettings()
      .then((r) => {
        setDefaultPercentage(r.default_percentage ?? 1.9);
        setCardTypes(Array.isArray(r.card_types) && r.card_types.length > 0 ? r.card_types : [{ name: "CREDIT PREMIUM", percentage: 2 }, { name: "INTERNATIONAL CARDS", percentage: 1.5 }]);
      })
      .catch(() => {});
    getReconciliationBankAccounts()
      .then((r) => {
        setCardAccount(r.card_account || "");
        setCashAccount(r.cash_account || "");
      })
      .catch(() => {});
  }, []);

  async function handleSave() {
    setLoading(true);
    setMessage(null);
    try {
      await updateReconciliationInboxConfig({ host, port, user, password, secure: true });
      setConfigured(true);
      setMessage("Saved. Emails will be fetched every 5 minutes.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveAccounts() {
    setAccountsSaving(true);
    setMessage(null);
    try {
      await updateReconciliationBankAccounts({ card_account: cardAccount, cash_account: cashAccount });
      setMessage("Bank accounts saved. Emails will be matched against these.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setAccountsSaving(false);
    }
  }

  async function handleSaveBankSettings() {
    setBankSaving(true);
    setMessage(null);
    try {
      await updateReconciliationBankSettings({ default_percentage: defaultPercentage, card_types: cardTypes });
      setMessage("Bank settings saved. Used for deduction comparison (POS vs CSV).");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBankSaving(false);
    }
  }

  function addCardType() {
    setCardTypes([...cardTypes, { name: "", percentage: 0 }]);
  }

  function removeCardType(i: number) {
    setCardTypes(cardTypes.filter((_, idx) => idx !== i));
  }

  async function handleFetchNow() {
    setFetching(true);
    setMessage(null);
    try {
      const r = await fetchReconciliationNow();
      if (r.ok) {
        setMessage(r.imported ? `Imported ${r.imported} transaction(s).` : "No new emails.");
      } else {
        setMessage(r.error || "Fetch failed");
      }
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setFetching(false);
    }
  }

  return (
    <div className="min-h-screen bg-black">
      <header className="border-b border-slate-800 bg-slate-900 px-6 py-4">
        <Link href="/settings" className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-2">
          <ArrowLeft className="w-4 h-4" /> Back to Settings
        </Link>
        <h1 className="text-xl font-bold text-sky-400">Cash & Card Reconciliation</h1>
        <p className="text-slate-400 text-sm">Auto-fetch UTAP and Bank emails. Set up auto-forward, then configure IMAP inbox.</p>
      </header>

      <main className="p-6 max-w-2xl space-y-8">
        {/* Auto-Forward Setup */}
        <section className="rounded-xl bg-amber-950/30 border border-amber-700/50 p-5">
          <h2 className="text-lg font-semibold text-amber-200 mb-3 flex items-center gap-2">
            <Mail className="w-5 h-5" /> Step 1: Auto-Forward Emails
          </h2>
          <p className="text-slate-300 text-sm mb-4">
            In your email (Gmail, Outlook, etc.) where UTAP and Bank send reports:
          </p>
          <ol className="list-decimal list-inside space-y-2 text-slate-300 text-sm">
            <li>Create a <strong>filter</strong> or <strong>rule</strong></li>
            <li>Condition: From contains <code className="bg-slate-800 px-1 rounded">utap</code> OR From contains your bank domain</li>
            <li>Action: <strong>Forward to</strong> the inbox below (e.g. reconciliation@yourbusiness.com)</li>
          </ol>
          <p className="text-slate-500 text-xs mt-3">
            Create a dedicated Gmail/Outlook for reconciliation. Use its IMAP credentials in Step 2.
          </p>
        </section>

        {/* IMAP Config */}
        <section className="rounded-xl bg-slate-800/50 border border-slate-700 p-5">
          <h2 className="text-lg font-semibold text-slate-200 mb-4">Step 2: IMAP Inbox (where emails are forwarded)</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Host</label>
              <input
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="imap.gmail.com"
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Port</label>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(parseInt(e.target.value, 10) || 993)}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Email (user)</label>
              <input
                type="email"
                value={user}
                onChange={(e) => setUser(e.target.value)}
                placeholder="reconciliation@yourbusiness.com"
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Password (App Password for Gmail)</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-white"
              />
              <p className="text-slate-500 text-xs mt-1">Gmail: Use App Password (2FA required). Outlook: Use account password or app password.</p>
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button
              onClick={handleSave}
              disabled={loading || !host || !user || !password}
              className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-medium"
            >
              {loading ? "Saving..." : "Save"}
            </button>
            {configured && (
              <button
                onClick={handleFetchNow}
                disabled={fetching}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200"
              >
                <RefreshCw className={`w-4 h-4 ${fetching ? "animate-spin" : ""}`} /> {fetching ? "Fetching..." : "Fetch now"}
              </button>
            )}
          </div>
          {message && (
            <p className={`mt-3 text-sm ${message.includes("failed") || message.includes("error") ? "text-red-400" : "text-emerald-400"}`}>
              {message}
            </p>
          )}
        </section>

        {/* Bank Account Numbers */}
        <section className="rounded-xl bg-emerald-950/30 border border-emerald-700/50 p-5">
          <h2 className="text-lg font-semibold text-emerald-200 mb-3">Bank Account Numbers</h2>
          <p className="text-slate-300 text-sm mb-4">
            Enter your Emirates NBD account numbers. Emails (card credited, cash deposit) will be matched. Use * for wildcard (e.g. 101*67*02).
          </p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Card / UTAP account (credited to)</label>
              <input
                type="text"
                value={cardAccount}
                onChange={(e) => setCardAccount(e.target.value)}
                placeholder="101XXX67XXX02 or 101*67*02"
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Cash / ATM deposit account (deposited to)</label>
              <input
                type="text"
                value={cashAccount}
                onChange={(e) => setCashAccount(e.target.value)}
                placeholder="111XXX67XXX01 or 111*67*01"
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-white"
              />
            </div>
          </div>
          <button
            onClick={handleSaveAccounts}
            disabled={accountsSaving}
            className="mt-4 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium"
          >
            {accountsSaving ? "Saving..." : "Save accounts"}
          </button>
        </section>

        {/* Bank Settings */}
        <section className="rounded-xl bg-violet-950/30 border border-violet-700/50 p-5">
          <h2 className="text-lg font-semibold text-violet-200 mb-3 flex items-center gap-2">
            <Percent className="w-5 h-5" /> Bank Settings (Deduction %)
          </h2>
          <p className="text-slate-300 text-sm mb-4">
            Enter bank percentages for comparison. POS card total × % = expected deduction. CSV Deduction column = actual. Difference shown if mismatch.
          </p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Default % (used when card type unknown)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={defaultPercentage}
                onChange={(e) => setDefaultPercentage(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-2">Card types (CREDIT PREMIUM, INTERNATIONAL CARDS, etc.)</label>
              <div className="space-y-2">
                {cardTypes.map((ct, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={ct.name}
                      onChange={(e) => setCardTypes(cardTypes.map((c, j) => j === i ? { ...c, name: e.target.value } : c))}
                      placeholder="Card type name"
                      className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-white text-sm"
                    />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={ct.percentage}
                      onChange={(e) => setCardTypes(cardTypes.map((c, j) => j === i ? { ...c, percentage: parseFloat(e.target.value) || 0 } : c))}
                      placeholder="%"
                      className="w-20 px-2 py-2 rounded-lg bg-slate-900 border border-slate-600 text-white text-sm"
                    />
                    <span className="text-slate-400 text-sm">%</span>
                    <button type="button" onClick={() => removeCardType(i)} className="p-1 text-red-400 hover:text-red-300">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={addCardType} className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm">
                <Plus className="w-4 h-4" /> Add card type
              </button>
            </div>
          </div>
          <button
            onClick={handleSaveBankSettings}
            disabled={bankSaving}
            className="mt-4 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-medium"
          >
            {bankSaving ? "Saving..." : "Save bank settings"}
          </button>
        </section>

        {/* CSV Format */}
        <section className="rounded-xl bg-slate-800/30 border border-slate-700 p-5">
          <h2 className="text-lg font-semibold text-slate-200 mb-2">Expected CSV Format</h2>
          <p className="text-slate-400 text-sm">
            Attachments must be <strong>.csv</strong>. Supported columns:
          </p>
          <ul className="text-slate-400 text-sm mt-2 space-y-1 list-disc list-inside">
            <li><strong>Date:</strong> TARIH, date, transaction_date</li>
            <li><strong>Amount:</strong> TxnAmt, amount, tutar, ODEME_TUTARI</li>
            <li><strong>Deduction:</strong> Deduction, kesinti (fee from bank)</li>
            <li><strong>Net:</strong> NetAmt, net_amount (amount after deduction)</li>
            <li><strong>Description:</strong> description, açıklama, ODEME_TIPI</li>
          </ul>
          <p className="text-slate-500 text-xs mt-2">
            The <strong>TARIH</strong> column: first row &quot;TOTAL&quot; is skipped. Below it, each row = one card transaction.
          </p>
          <p className="text-slate-500 text-xs mt-1">
            UTAP emails → Card. Bank emails → Cash or Card by description.
          </p>
        </section>

        <Link href="/dashboard/cash-card" className="inline-flex items-center gap-2 text-sky-400 hover:text-sky-300">
          View Reconciliation Summary →
        </Link>
      </main>
    </div>
  );
}
