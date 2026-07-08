"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function DashboardAutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => router.refresh();
    const onVisibility = () => { if (document.visibilityState === "visible") refresh(); };
    const onStorage = (event: StorageEvent) => { if (event.key === "medirank_analytics_pulse") refresh(); };
    window.addEventListener("focus", refresh);
    window.addEventListener("medirank:analytics-event", refresh);
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("medirank:analytics-event", refresh);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router]);
  return null;
}
