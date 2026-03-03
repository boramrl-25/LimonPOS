"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronDown, ChevronUp, HelpCircle } from "lucide-react";
import { getZohoConfig, updateZohoConfig, exchangeZohoCode } from "@/lib/api";

export default function ZohoSettingsPage() {
  const [config, setConfig] = useState({
    enabled: "false",
    client_id: "",
    client_secret: "",
    refresh_token: "",
    organization_id: "",
    customer_id: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [authCode, setAuthCode] = useState("");
  const [exchanging, setExchanging] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const c = await getZohoConfig();
      setConfig({
        enabled: c.enabled || "false",
        client_id: c.client_id || "",
        client_secret: c.client_secret || "",
        refresh_token: c.refresh_token || "",
        organization_id: c.organization_id || "",
        customer_id: c.customer_id || "",
      });
    } catch {
      window.location.href = "/login";
    } finally {
      setLoading(false);
    }
  }

  async function save(e?: React.MouseEvent) {
    e?.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      await updateZohoConfig(config);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl relative">
      <Link href="/settings" className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to Settings
      </Link>

      <h1 className="text-2xl font-bold text-sky-400 mb-2">Zoho Books Integration</h1>
      <p className="text-slate-400 mb-4">Sales are sent to Zoho Books as Sales Receipt when payment is completed. Product import also uses Zoho Books items (including price).</p>

      <button
        onClick={() => setShowHelp((h) => !h)}
        className="flex items-center gap-2 text-sky-400 hover:text-sky-300 text-sm mb-6"
      >
        <HelpCircle className="w-4 h-4" />
        Where do I get OAuth credentials?
        {showHelp ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {showHelp && (
        <div className="mb-8 p-4 rounded-lg bg-slate-800/80 border border-slate-600 text-sm text-slate-300 space-y-4">
          <p className="font-medium text-white">Step by step:</p>
          <ol className="list-decimal list-inside space-y-2">
            <li><strong>Client ID & Client Secret:</strong> <a href="https://api-console.zoho.com" target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">api-console.zoho.com</a> → Add Client → Server-based Application → Create. Client ID and Secret will appear on screen.</li>
            <li><strong>Refresh Token:</strong> On the same page use &quot;Generate Code&quot; to get a code with scope (e.g. ZohoBooks.fullaccess.all). Then POST <code className="text-sky-400 bg-slate-900 px-1 rounded">https://accounts.zoho.com/oauth/v2/token</code> with <code className="text-sky-400 bg-slate-900 px-1 rounded">code</code>, <code className="text-sky-400 bg-slate-900 px-1 rounded">client_id</code>, <code className="text-sky-400 bg-slate-900 px-1 rounded">client_secret</code>, <code className="text-sky-400 bg-slate-900 px-1 rounded">redirect_uri</code>, <code className="text-sky-400 bg-slate-900 px-1 rounded">grant_type=authorization_code</code>. Copy the <code className="text-sky-400 bg-slate-900 px-1 rounded">refresh_token</code> from the response.</li>
            <li><strong>Organization ID:</strong> Zoho Books → Settings → Organization Profile, or the number in URL (<code className="text-sky-400 bg-slate-900 px-1 rounded">books.zoho.com/app/XXXXXX</code>).</li>
          </ol>
          <p>Detailed guide: <code className="text-sky-400 bg-slate-900 px-1 rounded">pos-backoffice/ZOHO_OAUTH_KILAVUZU.md</code></p>
        </div>
      )}

      <div className="space-y-4 mb-8">
        <div className="flex items-center justify-between p-4 rounded-lg bg-slate-800/50 border border-slate-700">
          <span className="font-medium">Zoho Books Enabled</span>
          <button
            onClick={() => setConfig((c) => ({ ...c, enabled: c.enabled === "true" ? "false" : "true" }))}
            className={`w-12 h-6 rounded-full transition-colors ${config.enabled === "true" ? "bg-sky-500" : "bg-slate-600"}`}
          >
            <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${config.enabled === "true" ? "translate-x-6" : "translate-x-1"}`} style={{ marginTop: 2 }} />
          </button>
        </div>
      </div>

      <div className="space-y-4 p-4 rounded-lg bg-slate-800/50 border border-slate-700 mb-8">
        <div className="p-3 rounded-lg bg-emerald-900/20 border border-emerald-700/50 mb-4">
          <p className="text-sm text-emerald-300 font-medium mb-2">Authorization Code → Refresh Token</p>
          <p className="text-xs text-slate-400 mb-2">Zoho&apos;dan &quot;Generate Code&quot; ile aldığınız kodu yapıştırın (Client ID ve Secret önce girilmeli):</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={authCode}
              onChange={(e) => setAuthCode(e.target.value)}
              placeholder="1000.xxxxx..."
              className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-white text-sm"
            />
            <button type="button" onClick={(e) => exchangeCode(e)} disabled={exchanging} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm">
              {exchanging ? "..." : "Token Al"}
            </button>
          </div>
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">Client ID</label>
          <input type="text" value={config.client_id} onChange={(e) => setConfig((c) => ({ ...c, client_id: e.target.value }))} placeholder="Zoho Client ID" className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-white" />
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">Client Secret</label>
          <input type="password" value={config.client_secret} onChange={(e) => setConfig((c) => ({ ...c, client_secret: e.target.value }))} placeholder="••••••••" className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-white" />
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">Refresh Token</label>
          <input type="password" value={config.refresh_token} onChange={(e) => setConfig((c) => ({ ...c, refresh_token: e.target.value }))} placeholder="••••••••" className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-white" />
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">Organization ID</label>
          <input type="text" value={config.organization_id} onChange={(e) => setConfig((c) => ({ ...c, organization_id: e.target.value }))} placeholder="Zoho Books Organization ID" className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-white" />
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">Customer ID (Walk-in customer)</label>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={config.customer_id}
            onChange={(e) => setConfig((c) => ({ ...c, customer_id: e.target.value }))}
            placeholder="e.g. 864689000000385153"
            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-white"
          />
          <p className="text-xs text-slate-500 mt-1">Zoho Books → Contacts → the number after /contacts/ in the URL</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="button" onClick={(e) => save(e)} disabled={saving} className="px-6 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-medium">
          {saving ? "Saving..." : "Save"}
        </button>
        {saved && <span className="text-emerald-400 text-sm">Saved successfully.</span>}
      </div>
    </div>
  );
}
