"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { completeSetup, getToken } from "@/lib/api";
import { CheckCircle, ChevronRight, Package, BookOpen } from "lucide-react";
import Link from "next/link";

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  useEffect(() => {
    if (!getToken()) router.replace("/login");
  }, [router]);
  const [loading, setLoading] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [setupZoho, setSetupZoho] = useState<"yes" | "later">("later");

  async function finish() {
    setLoading(true);
    try {
      await completeSetup();
      router.replace(setupZoho === "yes" ? "/settings/zoho" : "/");
      router.refresh();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-sky-400">Limon POS</h1>
          <p className="text-slate-400 text-sm mt-1">Welcome – Setup</p>
        </div>

        <div className="rounded-xl bg-slate-900 border border-slate-700 p-6 space-y-6">
          {step === 1 && (
            <>
              <h2 className="text-lg font-semibold text-white">Business name (optional)</h2>
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="e.g. Limon Restaurant"
                className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
              />
              <button
                onClick={() => setStep(2)}
                className="w-full py-3 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium flex items-center justify-center gap-2"
              >
                Continue <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="text-lg font-semibold text-white">Zoho Books integration</h2>
              <p className="text-sm text-slate-400">Do you want to send sales to Zoho Books automatically?</p>
              <div className="space-y-2">
                <button
                  onClick={() => setSetupZoho("later")}
                  className={`w-full p-4 rounded-lg border flex items-center gap-3 transition-colors ${
                    setupZoho === "later" ? "border-sky-500 bg-sky-500/10" : "border-slate-600 hover:border-slate-500"
                  }`}
                >
                  <Package className="w-5 h-5 text-slate-400" />
                  <div className="text-left">
                    <span className="font-medium">Skip for now</span>
                    <p className="text-xs text-slate-400">You can add later from Settings → Zoho Books</p>
                  </div>
                </button>
                <button
                  onClick={() => setSetupZoho("yes")}
                  className={`w-full p-4 rounded-lg border flex items-center gap-3 transition-colors ${
                    setupZoho === "yes" ? "border-sky-500 bg-sky-500/10" : "border-slate-600 hover:border-slate-500"
                  }`}
                >
                  <BookOpen className="w-5 h-5 text-slate-400" />
                  <div className="text-left">
                    <span className="font-medium">Yes, set up now</span>
                    <p className="text-xs text-slate-400">You will be redirected to Settings → Zoho Books</p>
                  </div>
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 py-3 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800"
                >
                  Back
                </button>
                <button
                  onClick={finish}
                  disabled={loading}
                  className="flex-1 py-3 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? "Saving..." : "Complete setup"}
                  <CheckCircle className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </div>

        {setupZoho === "yes" && step === 2 && (
          <p className="mt-4 text-center text-sm text-slate-400">
            After setup you can continue from the{" "}
            <Link href="/settings/zoho" className="text-sky-400 hover:underline">
              Zoho Books
            </Link>{" "}
            page.
          </p>
        )}

        <p className="mt-6 text-center text-xs text-slate-500">Setup PIN: 1234</p>
      </div>
    </div>
  );
}
