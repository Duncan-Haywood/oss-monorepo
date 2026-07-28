import { NextResponse } from "next/server";
import { getLeadBySlug, recordLeadPreviewOpen } from "@/lib/db";
import {
  shouldPersistPreviewOpen,
  shouldRecordPreviewOpen,
} from "@/lib/leads/preview-open";
import { PREVIEW_OPEN_CONVEX_PRIMARY } from "@/lib/leads/preview-open-persist";
import { ConvexPrimaryWriteError } from "@/lib/payments/convex-primary";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/security/rate-limit";

type RouteContext = { params: Promise<{ slug: string }> };

/**
 * Record an attributed preview open. Body optional: { openedAt?: ISO string }.
 * Query: src, utm_source — or lead stage outreach_sent/discovery_call.
 *
 * When Convex is configured, writes pass requireConvex so a mutation failure
 * returns 503 instead of claiming recorded:true after a SQLite-only update
 * that Convex-first dashboard readers never see.
 *
 * Rate limited per client IP (best-effort, per-instance — see
 * src/lib/security/rate-limit.ts) to blunt beacon-flooding abuse; the
 * existing debounce (shouldPersistPreviewOpen) already limits legitimate
 * writes per lead, so this only guards against a scripted burst.
 */
export async function POST(request: Request, context: RouteContext) {
  const { slug } = await context.params;
  if (!slug || slug.length > 120) {
    return NextResponse.json({ ok: false, error: "Invalid slug" }, { status: 400 });
  }

  const clientIp = clientIpFromHeaders(request.headers);
  const rate = checkRateLimit(`preview-open:${clientIp}`);
  if (!rate.allowed) {
    return NextResponse.json(
      { ok: false, recorded: false, reason: "rate_limited", error: "Too many requests." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  const url = new URL(request.url);
  let openedAt = new Date().toISOString();
  try {
    const body = (await request.json()) as { openedAt?: string };
    if (body?.openedAt && !Number.isNaN(Date.parse(body.openedAt))) {
      openedAt = new Date(body.openedAt).toISOString();
    }
  } catch {
    // empty body is fine
  }

  const lead = await getLeadBySlug(slug);
  if (!lead) {
    return NextResponse.json({ ok: true, recorded: false, reason: "unknown_lead" });
  }

  const src = url.searchParams.get("src");
  const utmSource = url.searchParams.get("utm_source");
  if (!shouldRecordPreviewOpen({ src, utmSource, stage: lead.stage })) {
    return NextResponse.json({ ok: true, recorded: false, reason: "not_attributed" });
  }

  const nowMs = Date.parse(openedAt);
  if (!shouldPersistPreviewOpen(lead.lastPreviewOpenAt, nowMs)) {
    return NextResponse.json({ ok: true, recorded: false, reason: "debounced" });
  }

  try {
    const result = await recordLeadPreviewOpen(
      slug,
      openedAt,
      PREVIEW_OPEN_CONVEX_PRIMARY,
    );
    return NextResponse.json({ ok: true, recorded: result.recorded });
  } catch (error) {
    if (error instanceof ConvexPrimaryWriteError) {
      return NextResponse.json(
        {
          ok: false,
          recorded: false,
          reason: "persist_failed",
          error: "Could not record preview open right now.",
        },
        { status: 503 },
      );
    }
    throw error;
  }
}
