"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

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
