"use client";

import { useEffect } from "react";
import {
  buildPreviewOpenBeaconPath,
  shouldFirePreviewOpenBeacon,
} from "@/lib/leads/preview-open";
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
 *
 * Attribution query params are length-bounded before the fetch URL is built
 * (preview-page-src-utm-field-length-cap); the API route also bounds.
 */
export function PreviewOpenBeacon({
  slug,
  src,
  utmSource,
  trackByStage = false,
}: PreviewOpenBeaconProps) {
  useEffect(() => {
    if (!shouldFirePreviewOpenBeacon({ src, utmSource, trackByStage })) return;

    const path = buildPreviewOpenBeaconPath(encodeLeadSlugPathSegment(slug), {
      src,
      utmSource,
    });

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
