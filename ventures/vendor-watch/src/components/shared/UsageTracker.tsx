"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export default function UsageTracker() {
  const pathname = usePathname();

  useEffect(() => {
    try {
      const privacy = navigator as Navigator & { globalPrivacyControl?: boolean };
      if (privacy.doNotTrack === "1" || privacy.globalPrivacyControl === true) {
        return;
      }
      if (globalThis.localStorage?.getItem("vendor-watch:usage-opt-out") === "1") {
        return;
      }
    } catch {
      return;
    }
    void fetch("/api/usage", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "page_view", path: pathname }),
      keepalive: true,
    }).catch(() => undefined);
  }, [pathname]);

  return null;
}
