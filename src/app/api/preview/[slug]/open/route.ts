import { NextResponse } from "next/server";
import { getLeadBySlug, recordLeadPreviewOpen } from "@/lib/db";
import {
  shouldPersistPreviewOpen,
  shouldRecordPreviewOpen,
} from "@/lib/leads/preview-open";

type RouteContext = { params: Promise<{ slug: string }> };

/**
 * Record an attributed preview open. Body optional: { openedAt?: ISO string }.
 * Query: src, utm_source — or lead stage outreach_sent/discovery_call.
 */
export async function POST(request: Request, context: RouteContext) {
  const { slug } = await context.params;
  if (!slug || slug.length > 120) {
    return NextResponse.json({ ok: false, error: "Invalid slug" }, { status: 400 });
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

  const result = await recordLeadPreviewOpen(slug, openedAt);
  return NextResponse.json({ ok: true, recorded: result.recorded });
}
