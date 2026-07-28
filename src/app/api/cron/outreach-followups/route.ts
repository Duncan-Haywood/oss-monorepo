import { NextResponse } from "next/server";
import { getLeads } from "@/lib/db";
import { listFollowUpsDue } from "@/lib/email/outreach-followups";
import { sendOutreachFollowUpEmail } from "@/lib/leads/send-follow-up";
import { captureError } from "@/lib/observability/error-tracking";
import { verifyCronRequest } from "@/lib/security/cron-secret";
import { checkRateLimit, clientIpFromHeaders, type RateLimitConfig } from "@/lib/security/rate-limit";

/**
 * Automated daily trigger for cold-outreach Email 2/3 follow-ups — see
 * outreach-followup-cron-automation in BUSINESS_DECISIONS for why this
 * exists: sendFollowUpAction (src/app/dashboard/leads/actions.ts) was, until
 * this route shipped, the ONLY way a follow-up went out — an operator
 * manually clicking a per-lead button on /dashboard/leads. pipeline-health
 * and the (already automated) daily digest both surface a "follow-ups due"
 * count/list, but nothing ever actually SENT the follow-up without a human
 * acting on that list, day after day, for the top-of-funnel sequence that
 * turns a free preview into a paying customer.
 *
 * Enabled the same way as the other two cron routes: set CRON_SECRET, add a
 * third vercel.json "crons" entry pointing here (see .env.example and
 * /docs/launch-checklist). Shares src/lib/security/cron-secret.ts's
 * verification with GET /api/cron/daily-digest and
 * GET /api/cron/checkout-recovery so all three cron routes can never drift
 * on the auth check.
 *
 * Dormant (mirrors the other two cron routes' own notConfigured pattern)
 * until CRON_SECRET is set — a misconfigured deployment should show as a
 * failing cron run in Vercel's own dashboard, not silently report success
 * while never actually following up with anyone. Like checkout-recovery
 * (and unlike the digest), there is no single "recipient env var" gate here
 * — follow-up emails go to the lead's own email, already required by the
 * existing manual action, so a missing recipient is a per-lead skip in the
 * response body, not a whole-route 501.
 */

const CRON_OUTREACH_FOLLOWUPS_RATE_LIMIT: RateLimitConfig = { limit: 5, windowMs: 60_000 };

function notConfigured(message: string) {
  return NextResponse.json(
    {
      error: "Outreach follow-ups cron not configured",
      message,
      docs: "/docs/launch-checklist",
    },
    { status: 501 },
  );
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    return notConfigured("Set CRON_SECRET (see .env.example) and configure vercel.json crons.");
  }

  if (!verifyCronRequest(request.headers, cronSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Defense in depth against a leaked/misconfigured secret being replayed —
  // Vercel Cron itself only calls this once daily, so this never blocks a
  // legitimate invocation.
  const clientIp = clientIpFromHeaders(request.headers);
  const rate = checkRateLimit(`cron-outreach-followups:${clientIp}`, CRON_OUTREACH_FOLLOWUPS_RATE_LIMIT);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const nowMs = Date.now();

  try {
    const leads = await getLeads();
    const due = listFollowUpsDue(leads, nowMs);

    let sentCount = 0;
    const failures: Array<{ slug: string; error: string }> = [];

    // Sequential, not Promise.all: each send goes through the same
    // mark-then-send CAS guard the manual dashboard button uses, and this
    // route's own expected volume (leads due for a follow-up for a
    // single-operator business) never approaches a scale where sequential
    // sends matter for latency.
    for (const lead of due) {
      const result = await sendOutreachFollowUpEmail(lead);
      if (result.success) {
        sentCount += 1;
      } else {
        failures.push({ slug: lead.slug, error: result.error });
      }
    }

    if (failures.length > 0) {
      await captureError(
        new Error(`outreach-followups cron: ${failures.length} of ${due.length} follow-up sends failed`),
        { component: "cron-outreach-followups", failures },
      );
    }

    return NextResponse.json({ success: true, attempted: due.length, sent: sentCount, failed: failures.length, failures });
  } catch (error) {
    await captureError(error, { component: "cron-outreach-followups" });
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
