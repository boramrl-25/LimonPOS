"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ReconciliationPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard/cash-card");
  }, [router]);
  return <p className="text-slate-400 p-8">Redirecting to Cash &amp; Card...</p>;
}
