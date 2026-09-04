"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function trackUsageEvent(
  name:
    | "catalog_cta"
    | "room_visualizer_cta"
    | "storefront_search"
    | "checkout_add"
    | "preflight_completed"
    | "preflight_exported"
    | "preflight_compared",
  path: string,
): void {
  void fetch("/api/usage", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, path }),
    keepalive: true,
  }).catch(() => undefined);
}

export default function UsageTracker() {
  const pathname = usePathname();

  useEffect(() => {
    void fetch("/api/usage", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "page_view", path: pathname }),
      keepalive: true,
    }).catch(() => undefined);
  }, [pathname]);

  return null;
}
