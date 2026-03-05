"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, X } from "lucide-react";
import { getVoidRequests, patchVoidRequest, getClosedBillAccessRequests, patchClosedBillAccessRequest } from "@/lib/api";

type VoidReq = {
  id: string;
  order_id: string;
  product_name: string;
  quantity: number;
  price: number;
  table_number: string;
  requested_by_user_name: string;
  requested_at: number;
  status: string;
};

type ClosedBillReq = {
  id: string;
  requested_by_user_id: string;
  requested_by_user_name: string;
  requested_at: number;
  status: string;
};

const WEB_APPROVER = { id: "web", name: "Web" };

export default function ApprovalsPage() {
  const [voidReqs, setVoidReqs] = useState<VoidReq[]>([]);
  const [closedBillReqs, setClosedBillReqs] = useState<ClosedBillReq[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [v, c] = await Promise.all([
        getVoidRequests("pending"),
        getClosedBillAccessRequests("pending"),
      ]);
      setVoidReqs(Array.isArray(v) ? v : []);
      setClosedBillReqs(Array.isArray(c) ? c : []);
    } catch {
      setVoidReqs([]);
      setClosedBillReqs([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, []);

  async function approveVoid(id: string) {
    setActing(id);
    try {
      await patchVoidRequest(id, {
        status: "approved",
        approved_by_supervisor_user_id: WEB_APPROVER.id,
        approved_by_supervisor_user_name: WEB_APPROVER.name,
        approved_by_supervisor_at: Date.now(),
        approved_by_kds_user_id: WEB_APPROVER.id,
        approved_by_kds_user_name: WEB_APPROVER.name,
        approved_by_kds_at: Date.now(),
      });
      await load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setActing(null);
    }
  }

  async function rejectVoid(id: string) {
    setActing(id);
    try {
      await patchVoidRequest(id, { status: "rejected" });
      await load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setActing(null);
    }
  }

  async function approveClosedBill(id: string) {
    setActing(id);
    try {
      await patchClosedBillAccessRequest(id, {
        status: "approved",
        approved_by_user_id: WEB_APPROVER.id,
        approved_by_user_name: WEB_APPROVER.name,
        approved_at: Date.now(),
      });
      await load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setActing(null);
    }
  }

  async function rejectClosedBill(id: string) {
    setActing(id);
    try {
      await patchClosedBillAccessRequest(id, { status: "rejected" });
      await load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setActing(null);
    }
  }

  return (
    <div className="min-h-screen bg-black">
      <header className="border-b border-slate-800 bg-slate-900 px-6 py-4">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="p-2 rounded-lg hover:bg-slate-800 transition-colors">
            <ArrowLeft className="w-5 h-5 text-slate-300" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-sky-400">Approval Requests</h1>
            <p className="text-slate-400 text-sm">Void requests and Closed Bill Access — approve from here (app or web).</p>
          </div>
        </div>
      </header>

      <main className="p-6 max-w-2xl mx-auto space-y-8">
        {loading && voidReqs.length === 0 && closedBillReqs.length === 0 ? (
          <p className="text-slate-500">Loading...</p>
        ) : (
          <>
            <section>
              <h2 className="text-lg font-semibold text-slate-200 mb-3">Void requests ({voidReqs.length})</h2>
              {voidReqs.length === 0 ? (
                <p className="text-slate-500 text-sm">No pending void requests.</p>
              ) : (
                <ul className="space-y-3">
                  {voidReqs.map((r) => (
                    <li key={r.id} className="p-4 rounded-xl bg-slate-800/60 border border-slate-700">
                      <p className="text-slate-200 font-medium">{r.product_name} × {r.quantity}</p>
                      <p className="text-slate-500 text-sm">Table {r.table_number} · {r.requested_by_user_name} · {new Date(r.requested_at).toLocaleString("tr-TR")}</p>
                      <div className="flex gap-2 mt-3">
                        <button
                          type="button"
                          onClick={() => approveVoid(r.id)}
                          disabled={acting !== null}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm disabled:opacity-50"
                        >
                          <Check className="w-4 h-4" /> Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => rejectVoid(r.id)}
                          disabled={acting !== null}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-600/80 hover:bg-red-500 text-white text-sm disabled:opacity-50"
                        >
                          <X className="w-4 h-4" /> Reject
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-200 mb-3">Closed Bill Access requests ({closedBillReqs.length})</h2>
              {closedBillReqs.length === 0 ? (
                <p className="text-slate-500 text-sm">No pending closed bill access requests.</p>
              ) : (
                <ul className="space-y-3">
                  {closedBillReqs.map((r) => (
                    <li key={r.id} className="p-4 rounded-xl bg-slate-800/60 border border-slate-700">
                      <p className="text-slate-200 font-medium">{r.requested_by_user_name}</p>
                      <p className="text-slate-500 text-sm">{new Date(r.requested_at).toLocaleString("tr-TR")}</p>
                      <div className="flex gap-2 mt-3">
                        <button
                          type="button"
                          onClick={() => approveClosedBill(r.id)}
                          disabled={acting !== null}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm disabled:opacity-50"
                        >
                          <Check className="w-4 h-4" /> Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => rejectClosedBill(r.id)}
                          disabled={acting !== null}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-600/80 hover:bg-red-500 text-white text-sm disabled:opacity-50"
                        >
                          <X className="w-4 h-4" /> Reject
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
