"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";

export default function EmailSettingsPage() {
  const [recipients, setRecipients] = useState(["manager@example.com", "owner@example.com"]);
  const [newRecipient, setNewRecipient] = useState("");
  const [smtpHost, setSmtpHost] = useState("smtp.gmail.com");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");

  const addRecipient = () => {
    if (newRecipient && recipients.length < 4) {
      setRecipients([...recipients, newRecipient]);
      setNewRecipient("");
    }
  };

  const removeRecipient = (idx: number) => {
    setRecipients(recipients.filter((_, i) => i !== idx));
  };

  return (
    <div className="p-6 max-w-2xl">
      <Link href="/settings" className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to Settings
      </Link>

      <h1 className="text-2xl font-bold text-sky-400 mb-2">Email & SMTP Settings</h1>
      <p className="text-slate-400 mb-8">Z-Report recipients and SMTP configuration</p>

      {/* Z-Report Recipients */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-slate-200 mb-4">Z-Report Recipients (max 4)</h2>
        <ul className="space-y-2 mb-4">
          {recipients.map((r, i) => (
            <li key={i} className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-slate-700">
              <span className="text-slate-200">{r}</span>
              <button onClick={() => removeRecipient(i)} className="text-red-400 hover:text-red-300 p-1">
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
        {recipients.length < 4 && (
          <div className="flex gap-2">
            <input
              type="email"
              value={newRecipient}
              onChange={(e) => setNewRecipient(e.target.value)}
              placeholder="email@example.com"
              className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-white placeholder-slate-500"
            />
            <button
              onClick={addRecipient}
              className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium"
            >
              <Plus className="w-4 h-4" /> Add
            </button>
          </div>
        )}
      </section>

      {/* SMTP Config */}
      <section>
        <h2 className="text-lg font-semibold text-slate-200 mb-4">SMTP Configuration</h2>
        <div className="space-y-4 p-4 rounded-lg bg-slate-800/50 border border-slate-700">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Host</label>
            <input
              type="text"
              value={smtpHost}
              onChange={(e) => setSmtpHost(e.target.value)}
              placeholder="smtp.gmail.com"
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-white placeholder-slate-500"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Port</label>
            <input
              type="text"
              value={smtpPort}
              onChange={(e) => setSmtpPort(e.target.value)}
              placeholder="587"
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-white placeholder-slate-500"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">User</label>
            <input
              type="text"
              value={smtpUser}
              onChange={(e) => setSmtpUser(e.target.value)}
              placeholder="your-email@gmail.com"
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-white placeholder-slate-500"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Password</label>
            <input
              type="password"
              value={smtpPassword}
              onChange={(e) => setSmtpPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-white placeholder-slate-500"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
