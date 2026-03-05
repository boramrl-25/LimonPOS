"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DailySalesPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);
  return (
    <div className="min-h-screen bg-black flex items-center justify-center text-slate-400">
      Redirecting to Dashboard...
    </div>
  );
}
