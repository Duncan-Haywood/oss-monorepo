import { NextResponse } from "next/server";
import { getLeadBySlug, recordLeadPreviewOpen } from "@/lib/db";
import {
  resolvePreviewOpenAttrParam,
  resolvePreviewOpenedAt,
  shouldPersistPreviewOpen,
  shouldRecordPreviewOpen,
} from "@/lib/leads/preview-open";
import { PREVIEW_OPEN_CONVEX_PRIMARY } from "@/lib/leads/preview-open-persist";
import { isPublicLeadSlugPathLengthOk } from "@/lib/leads/slug-path";
import { ConvexPrimaryWriteError } from "@/lib/payments/convex-primary";
import { readJsonBodyWithByteLimit } from "@/lib/security/json-body";
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
 *
 * Path slug length is hard-capped via isPublicLeadSlugPathLengthOk (shared
 * with POST /api/contact/[slug]) before CRM lookup. Raw JSON body is
 * hard-capped via readJsonBodyWithByteLimit (over-long → 400) before field
 * parsers run — field caps alone still allocate unbounded request.json().
 * Optional body.openedAt is length-bounded via resolvePreviewOpenedAt
 * (over-long → server now) so Date.parse never sees multi-KB probes.
 * Optional `src` / `utm_source` query params are length-bounded via
 * resolvePreviewOpenAttrParam (over-long → missing) so attribution matching
 * never sees multi-KB probes. Empty / invalid JSON body is fine (beacon
 * falls back to server now).
 */
export async function POST(request: Request, context: RouteContext) {
  const { slug } = await context.params;
  if (!slug || !isPublicLeadSlugPathLengthOk(slug)) {
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
  const parsedBody = await readJsonBodyWithByteLimit<{ openedAt?: unknown }>(request);
  if (!parsedBody.ok) {
    if (parsedBody.reason === "too_large") {
      return NextResponse.json(
        { ok: false, recorded: false, reason: "body_too_large", error: "Request body is too large" },
        { status: 400 },
      );
    }
    // empty / invalid JSON body is fine — keep server now
  } else {
    openedAt = resolvePreviewOpenedAt(parsedBody.value?.openedAt, openedAt);
  }

  const lead = await getLeadBySlug(slug);
  if (!lead) {
    return NextResponse.json({ ok: true, recorded: false, reason: "unknown_lead" });
  }

  const src = resolvePreviewOpenAttrParam(url.searchParams.get("src"));
  const utmSource = resolvePreviewOpenAttrParam(url.searchParams.get("utm_source"));
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
