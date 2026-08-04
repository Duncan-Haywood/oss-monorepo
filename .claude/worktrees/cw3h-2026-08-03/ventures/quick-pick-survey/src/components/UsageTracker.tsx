"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { flushUsage, recordUsage } from "@/lib/usageClient";

export function UsageTracker() {
  const pathname = usePathname();
  useEffect(() => {
    const startedAt = performance.now();
    recordUsage("route_view", { path: pathname });
    return () => recordUsage("route_exit", {
      path: pathname,
      durationMs: Math.min(300_000, Math.round(performance.now() - startedAt)),
    });
  }, [pathname]);
  useEffect(() => {
    const leave = () => void flushUsage(true);
    const online = () => void flushUsage();
    const visibility = () => {
      if (document.visibilityState === "hidden") void flushUsage(true);
    };
    window.addEventListener("pagehide", leave);
    window.addEventListener("online", online);
    document.addEventListener("visibilitychange", visibility);
    void flushUsage();
    return () => {
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("online", online);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  return null;
}
