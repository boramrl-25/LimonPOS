"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { login } from "@/lib/api";

function LoginForm() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await login(pin);
      router.push(redirectTo);
      router.refresh();
    } catch (e) {
      const msg = (e as Error).message || "";
      if (msg.includes("fetch") || msg.includes("Failed") || msg.includes("timeout") || msg.includes("Network"))
        setError("Cannot reach API. Check https://api.the-limon.com/api is up and CORS allows this site.");
      else
        setError("Invalid PIN. Setup: 2222");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <form onSubmit={handleSubmit} className="w-full max-w-sm p-8 rounded-xl bg-slate-900 border border-slate-700">
        <h1 className="text-xl font-bold text-sky-400 mb-2">Limon POS Back-Office</h1>
        <p className="text-slate-400 text-sm mb-6">Admin login</p>
        <input
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="PIN"
          maxLength={6}
          className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
          autoFocus
        />
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        <button type="submit" className="w-full mt-4 py-3 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium">
          Login
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-black text-slate-400">Yükleniyor...</div>}>
      <LoginForm />
    </Suspense>
  );
}
