"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Shield, AlertTriangle, Smartphone, CheckCircle2, XCircle, RefreshCw, KeyRound } from "lucide-react";
import type { SecurityDevice, SecurityEvent, SecuritySettings, ActivationCode } from "@/lib/api";
import { getSecurityDevices, getSecurityEvents, getSecuritySettings, updateSecurityDevice, updateSecuritySettings, getActivationCodes, createActivationCode } from "@/lib/api";

function fmtTs(ts: number) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString("tr-TR");
  } catch {
    return String(ts);
  }
}

export default function SecurityPage() {
  const [devices, setDevices] = useState<SecurityDevice[]>([]);
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [settings, setSettings] = useState<SecuritySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [updatingDeviceId, setUpdatingDeviceId] = useState<string | null>(null);
  const [activationCodes, setActivationCodes] = useState<ActivationCode[]>([]);
  const [creatingCode, setCreatingCode] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [d, e, s, codes] = await Promise.all([
        getSecurityDevices(),
        getSecurityEvents(200),
        getSecuritySettings(),
        getActivationCodes(),
      ]);
      setDevices(d);
      setEvents(e);
      setSettings(s);
      setActivationCodes(codes);
    } catch (e) {
      setError((e as Error).message || "Failed to load security data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function handleDeviceStatus(id: string, status: "active" | "blocked" | "pending") {
    setUpdatingDeviceId(id);
    try {
      const updated = await updateSecurityDevice(id, { status });
      setDevices((prev) => prev.map((d) => (d.id === id ? { ...d, ...updated } : d)));
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setUpdatingDeviceId(null);
    }
  }

  async function handleSaveSettings(next: Partial<SecuritySettings>) {
    if (!settings) return;
    setSavingSettings(true);
    try {
      const updated = await updateSecuritySettings(next);
      setSettings(updated);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleCreateActivationCode() {
    setCreatingCode(true);
    try {
      const created = await createActivationCode(1440);
      setActivationCodes((prev) => [created, ...prev]);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setCreatingCode(false);
    }
  }

  return (
    <div className="min-h-screen bg-black text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900 px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/" className="p-2 rounded-lg hover:bg-slate-800 transition-colors">
            <ArrowLeft className="w-5 h-5 text-slate-300" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-sky-400 flex items-center gap-2">
              <Shield className="w-5 h-5" /> Security
            </h1>
            <p className="text-slate-400 text-sm">Devices, alerts and anti-fraud settings</p>
          </div>
        </div>
        <button
          type="button"
          onClick={loadAll}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </header>

      <main className="p-6 space-y-8">
        {error && <p className="text-amber-400 text-sm">{error}</p>}

        <section>
          <h2 className="text-lg font-semibold text-slate-100 mb-3 flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-sky-400" /> Devices
          </h2>
          <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/60">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-900">
                <tr>
                  <th className="px-3 py-2 text-left text-slate-400 font-medium">ID</th>
                  <th className="px-3 py-2 text-left text-slate-400 font-medium">Name</th>
                  <th className="px-3 py-2 text-left text-slate-400 font-medium">User</th>
                  <th className="px-3 py-2 text-left text-slate-400 font-medium">Status</th>
                  <th className="px-3 py-2 text-left text-slate-400 font-medium">Last seq</th>
                  <th className="px-3 py-2 text-left text-slate-400 font-medium">Last seen</th>
                  <th className="px-3 py-2 text-left text-slate-400 font-medium">Online</th>
                  <th className="px-3 py-2 text-left text-slate-400 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {devices.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-4 text-center text-slate-500">
                      No devices yet.
                    </td>
                  </tr>
                )}
                {devices.map((d) => (
                  <tr key={d.id} className="border-t border-slate-800">
                    <td className="px-3 py-2 text-slate-300 text-xs break-all">{d.id}</td>
                    <td className="px-3 py-2 text-slate-100">{d.name}</td>
                    <td className="px-3 py-2 text-slate-400 text-xs">{d.user_id || "—"}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs ${
                          d.status === "blocked"
                            ? "bg-red-900/60 text-red-200 border border-red-700/60"
                            : d.status === "pending"
                            ? "bg-amber-900/60 text-amber-200 border border-amber-700/60"
                            : "bg-emerald-900/40 text-emerald-200 border border-emerald-700/40"
                        }`}
                      >
                        {d.status || "active"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-300 text-right">{d.last_sequence || 0}</td>
                    <td className="px-3 py-2 text-slate-400 text-xs">{fmtTs(d.last_seen)}</td>
                    <td className="px-3 py-2">
                      {d.online ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-900/40 text-emerald-200 text-xs">
                          <CheckCircle2 className="w-3 h-3" /> Online
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 text-xs">
                          <XCircle className="w-3 h-3" /> Offline
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 space-x-2">
                      <button
                        type="button"
                        disabled={updatingDeviceId === d.id}
                        onClick={() => handleDeviceStatus(d.id, "active")}
                        className="px-2 py-0.5 rounded bg-emerald-700 hover:bg-emerald-600 text-xs disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={updatingDeviceId === d.id}
                        onClick={() => handleDeviceStatus(d.id, "blocked")}
                        className="px-2 py-0.5 rounded bg-red-700 hover:bg-red-600 text-xs disabled:opacity-50"
                      >
                        Block
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2">
            <h2 className="text-lg font-semibold text-slate-100 mb-3 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" /> Recent Alerts
            </h2>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 max-h-[420px] overflow-y-auto">
              {events.length === 0 ? (
                <p className="px-4 py-4 text-sm text-slate-400">No security events yet.</p>
              ) : (
                <ul className="divide-y divide-slate-800 text-sm">
                  {events.map((ev) => (
                    <li key={ev.id} className="px-4 py-3 flex flex-col gap-1">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium text-slate-100">{ev.type}</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs ${
                            ev.severity === "critical"
                              ? "bg-red-900/60 text-red-200 border border-red-700/60"
                              : ev.severity === "warning"
                              ? "bg-amber-900/60 text-amber-200 border border-amber-700/60"
                              : "bg-slate-800 text-slate-200 border border-slate-700/60"
                          }`}
                        >
                          {ev.severity}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 flex flex-wrap gap-2">
                        <span>{fmtTs(ev.ts)}</span>
                        {ev.device_id && <span>· Device: {ev.device_id}</span>}
                        {ev.user_id && <span>· User: {ev.user_id}</span>}
                      </div>
                      {ev.details && (
                        <pre className="mt-1 text-[11px] leading-snug text-slate-300 bg-slate-950/60 rounded p-2 overflow-x-auto">
                          {JSON.stringify(ev.details, null, 2)}
                        </pre>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-slate-100 mb-3">Security Settings</h2>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-4 text-sm">
              {!settings ? (
                <p className="text-slate-400">Loading settings...</p>
              ) : (
                <>
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={settings.require_device_approval}
                      onChange={(e) => handleSaveSettings({ require_device_approval: e.target.checked })}
                      disabled={savingSettings}
                    />
                    <span>
                      <span className="font-medium text-slate-100">Require device approval</span>
                      <p className="text-slate-400 text-xs">
                        New Android devices must be approved here before they can make sales.
                      </p>
                    </span>
                  </label>

                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={settings.alert_sequence_drop}
                      onChange={(e) => handleSaveSettings({ alert_sequence_drop: e.target.checked })}
                      disabled={savingSettings}
                    />
                    <span>
                      <span className="font-medium text-slate-100">Alert on sequence reset</span>
                      <p className="text-slate-400 text-xs">
                        When a device&apos;s local sequence number goes backwards (app reset or data wipe), create a critical alert.
                      </p>
                    </span>
                  </label>

                  <div className="space-y-1">
                    <label className="text-slate-200 text-sm font-medium">Webhook URL (optional)</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-100 placeholder:text-slate-500"
                      placeholder="https://hooks.example.com/limon-security"
                      value={settings.webhook_url}
                      onChange={(e) => setSettings({ ...settings, webhook_url: e.target.value })}
                      onBlur={() => handleSaveSettings({ webhook_url: settings.webhook_url })}
                      disabled={savingSettings}
                    />
                    <p className="text-slate-500 text-xs">
                      Critical alerts will be POSTed to this URL as JSON (for Slack, Telegram gateways, etc.).
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-100 mb-3 flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-emerald-400" /> Activation Codes
          </h2>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3 text-sm">
            <p className="text-slate-400 text-xs">
              Generate 10-digit activation codes from back office. Each POS device must enter a valid code on first install.
            </p>
            <button
              type="button"
              onClick={handleCreateActivationCode}
              disabled={creatingCode}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-xs text-white disabled:opacity-50"
            >
              <KeyRound className={`w-4 h-4 ${creatingCode ? "animate-spin" : ""}`} />
              Generate new 10-digit code (24h)
            </button>
            <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/40 max-h-64">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-900">
                  <tr>
                    <th className="px-3 py-2 text-left text-slate-400 font-medium">Code</th>
                    <th className="px-3 py-2 text-left text-slate-400 font-medium">Created</th>
                    <th className="px-3 py-2 text-left text-slate-400 font-medium">Expires</th>
                    <th className="px-3 py-2 text-left text-slate-400 font-medium">Used</th>
                    <th className="px-3 py-2 text-left text-slate-400 font-medium">Device</th>
                  </tr>
                </thead>
                <tbody>
                  {activationCodes.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-3 text-center text-slate-500">
                        No activation codes yet.
                      </td>
                    </tr>
                  )}
                  {activationCodes.map((c) => (
                    <tr key={c.id} className="border-t border-slate-800">
                      <td className="px-3 py-2 font-mono text-sm text-slate-100">{c.code}</td>
                      <td className="px-3 py-2 text-slate-400">{fmtTs(Date.parse(c.createdAt))}</td>
                      <td className="px-3 py-2 text-slate-400">
                        {c.expiresAt ? fmtTs(Date.parse(c.expiresAt)) : "—"}
                      </td>
                      <td className="px-3 py-2 text-slate-400">
                        {c.usedAt ? fmtTs(Date.parse(c.usedAt)) : "Not used"}
                      </td>
                      <td className="px-3 py-2 text-slate-400 text-xs break-all">{c.deviceId || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

