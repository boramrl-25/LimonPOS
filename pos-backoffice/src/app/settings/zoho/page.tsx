"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronDown, ChevronUp, HelpCircle, CheckCircle } from "lucide-react";
import { getZohoConfig, updateZohoConfig, exchangeZohoCode, checkZohoConnection } from "@/lib/api";

export default function ZohoSettingsPage() {
  const [config, setConfig] = useState({
    enabled: "false",
    client_id: "",
    client_secret: "",
    refresh_token: "",
    organization_id: "",
    customer_id: "",
    cash_account_id: "",
    card_account_id: "",
    dc: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [authCode, setAuthCode] = useState("");
  const [exchanging, setExchanging] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [checkResult, setCheckResult] = useState<{
    ok?: boolean;
    salesPushReady?: boolean;
    hasToken?: boolean;
    itemsCount?: number;
    groupsCount?: number;
    region?: string;
    checks?: { enabled?: boolean; orgId?: boolean; customerId?: boolean; refreshToken?: boolean; clientId?: boolean; clientSecret?: boolean };
    error?: string | null;
  } | null>(null);
  const [checking, setChecking] = useState(false);

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
        cash_account_id: c.cash_account_id || "",
        card_account_id: c.card_account_id || "",
        dc: (c as { dc?: string }).dc || "",
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

  async function handleExchangeCode(e?: React.MouseEvent) {
    e?.preventDefault();
    if (!authCode.trim() || !config.client_id || !config.client_secret) {
      alert("Authorization code, Client ID and Client Secret are required");
      return;
    }
    setExchanging(true);
    try {
      const result = await exchangeZohoCode(authCode.trim(), config.client_id, config.client_secret, undefined, config.dc);
      if (result.refresh_token) {
        setConfig((c) => ({ ...c, refresh_token: result.refresh_token }));
        setAuthCode("");
      }
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setExchanging(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl relative">
      <Link href="/settings" className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to Settings
      </Link>

      <h1 className="text-2xl font-bold text-sky-400 mb-2">Zoho Books Integration</h1>
      <p className="text-slate-400 mb-4">Satışlar ödeme alındığında Zoho Books&apos;a Sales Receipt olarak gönderilir. Nakit/kart/split ödemeler doğru hesaplara aktarılır. Zoho&apos;dan senkron edilen ürünler stoktan düşer.</p>

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
            <li><strong>Region:</strong> EU hesabı (api-console.zoho.eu) kullanıyorsanız yukarıda <strong>Region = EU</strong> seçin.</li>
            <li><strong>Client ID & Client Secret:</strong> <a href="https://api-console.zoho.eu" target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">api-console.zoho.eu</a> (EU) veya <a href="https://api-console.zoho.com" target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">api-console.zoho.com</a> (Global) → Add Client → Server-based Application → Create.</li>
            <li><strong>Refresh Token:</strong> Aynı sayfada &quot;Generate Code&quot; ile scope ZohoBooks.fullaccess.all seçip kod alın. Kodu yukarıdaki alana yapıştırıp <strong>Token Al</strong> butonuna basın.</li>
            <li><strong>Organization ID:</strong> Zoho Books → Settings → Organization Profile, veya URL&apos;deki sayı (books.zoho.eu/app/XXXXXX veya books.zoho.com/app/XXXXXX).</li>
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
            <button type="button" onClick={handleExchangeCode} disabled={exchanging} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm">
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
          <label className="block text-sm text-slate-400 mb-1">Region (Hesap bölgesi)</label>
          <select value={config.dc} onChange={(e) => setConfig((c) => ({ ...c, dc: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-white">
            <option value="">Global (zoho.com)</option>
            <option value="eu">EU (zoho.eu)</option>
          </select>
          <p className="text-xs text-slate-500 mt-1">Zoho EU hesabı kullanıyorsanız EU seçin</p>
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
        <div>
          <label className="block text-sm text-slate-400 mb-1">Cash Account ID (opsiyonel – nakit ödemelerin yatırılacağı hesap)</label>
          <input type="text" value={config.cash_account_id} onChange={(e) => setConfig((c) => ({ ...c, cash_account_id: e.target.value }))} placeholder="e.g. 864689000000385001" className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-white" />
          <p className="text-xs text-slate-500 mt-1">Chart of Accounts → Kasa hesabı ID</p>
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">Card/Bank Account ID (opsiyonel – kart ödemelerin yatırılacağı hesap)</label>
          <input type="text" value={config.card_account_id} onChange={(e) => setConfig((c) => ({ ...c, card_account_id: e.target.value }))} placeholder="e.g. 864689000000385002" className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-white" />
          <p className="text-xs text-slate-500 mt-1">Chart of Accounts veya Bank Accounts → Banka/Kredi Kartı hesabı ID</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <button type="button" onClick={(e) => save(e)} disabled={saving} className="px-6 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-medium">
          {saving ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={async () => {
            setChecking(true);
            setCheckResult(null);
            try {
              const r = await checkZohoConnection();
              setCheckResult(r as typeof checkResult);
            } catch (e) {
              setCheckResult({ error: (e as Error).message });
            } finally {
              setChecking(false);
            }
          }}
          disabled={checking}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white font-medium"
        >
          <CheckCircle className="w-4 h-4" />
          {checking ? "Kontrol ediliyor..." : "Zoho Entegrasyonu Kontrol Et"}
        </button>
        {saved && <span className="text-emerald-400 text-sm">Saved successfully.</span>}
      </div>

      {checkResult && (
        <div className={`p-4 rounded-lg border mb-6 ${checkResult.salesPushReady ? "bg-emerald-900/20 border-emerald-700" : "bg-amber-900/20 border-amber-700"}`}>
          {checkResult.salesPushReady ? (
            <>
              <p className="text-emerald-300 font-medium">✓ Zoho entegrasyonu hazır. Satışlar Zoho Books&apos;a gönderilecek.</p>
              {checkResult.region && <p className="text-slate-400 text-sm mt-1">Region: {checkResult.region}</p>}
              <p className="text-slate-500 text-xs mt-2">Satış gitmezse: App Server URL = api.the-limon.com, app güncel APK ile kurulu olmalı.</p>
            </>
          ) : (
            <>
              <p className="text-amber-300 font-medium">✗ Satışlar Zoho&apos;ya gitmeyecek. Eksik veya hatalı ayar.</p>
              {checkResult.region && <p className="text-slate-400 text-sm mt-1">Region: {checkResult.region}</p>}
            </>
          )}
          {checkResult.error && <p className="text-amber-200 text-sm mt-2 font-mono">{checkResult.error}</p>}
          {checkResult.checks && (
            <ul className="text-slate-300 text-sm mt-2 space-y-1">
              {Object.entries(checkResult.checks).map(([k, v]) => (
                <li key={k}>{v ? "✓" : "✗"} {k}: {v ? "OK" : "Eksik"}</li>
              ))}
            </ul>
          )}
          {checkResult.itemsCount != null && (
            <p className="text-slate-400 text-sm mt-2">Zoho ürün: {checkResult.itemsCount}, kategori: {checkResult.groupsCount ?? 0}</p>
          )}
        </div>
      )}
    </div>
  );
}
