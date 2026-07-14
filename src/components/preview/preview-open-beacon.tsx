"use client";

import { useEffect } from "react";
import { encodeLeadSlugPathSegment } from "@/lib/leads/slug-path";

interface PreviewOpenBeaconProps {
  slug: string;
  /** From URL search — pass from server when available. */
  src?: string | null;
  utmSource?: string | null;
  /** When true, fire even without query params (in-pipeline stages). */
  trackByStage?: boolean;
}

/**
 * Fire-and-forget open beacon for outreach attribution.
 * Skips when neither query attribution nor in-pipeline stage applies.
 */
export function PreviewOpenBeacon({
  slug,
  src,
  utmSource,
  trackByStage = false,
}: PreviewOpenBeaconProps) {
  useEffect(() => {
    const attributed =
      src === "outreach" ||
      src === "email" ||
      utmSource === "email" ||
      utmSource === "outreach" ||
      utmSource === "resend" ||
      trackByStage;
    if (!attributed) return;

    const params = new URLSearchParams();
    if (src) params.set("src", src);
    if (utmSource) params.set("utm_source", utmSource);
    const qs = params.toString();
    const path = `/api/preview/${encodeLeadSlugPathSegment(slug)}/open${qs ? `?${qs}` : ""}`;

    void fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ openedAt: new Date().toISOString() }),
      keepalive: true,
    }).catch(() => {
      // Non-blocking — open tracking must never break the preview.
    });
  }, [slug, src, utmSource, trackByStage]);

  return null;
}
