import { NextResponse } from "next/server";
import {
  leadSlugsEligibleForCommerceAbandonedRecovery,
  listAbandonedCheckoutsDue,
  listCommerceAbandonedCheckoutsDue,
} from "@/lib/checkout/abandoned-recovery";
import {
  recoverAbandonedBundleCheckout,
  recoverAbandonedCommerceCheckout,
} from "@/lib/checkout/recover-abandoned-checkout";
import { getLeads, listOpenCheckoutSessions, listOrders } from "@/lib/db";
import { captureError } from "@/lib/observability/error-tracking";
import { verifyCronRequest } from "@/lib/security/cron-secret";
import { checkRateLimit, clientIpFromHeaders, type RateLimitConfig } from "@/lib/security/rate-limit";

/**
 * Automated daily trigger for abandoned-checkout recovery — see
 * checkout-recovery-cron-automation in BUSINESS_DECISIONS for why this
 * exists: sendCheckoutRecoveryAction / sendCommerceCheckoutRecoveryAction
 * (src/app/dashboard/leads/actions.ts) were, until this route shipped, the
 * ONLY way a recovery nudge went out — an operator manually clicking a
 * per-session button on /dashboard/leads. pipeline-health and the (now
 * automated) daily digest both surface a "recovery due" count/list, but
 * nothing ever actually SENT the recovery email without a human acting on
 * that list in the 2-hour-to-however-long window before it goes stale.
 *
 * Enabled the same way as GET /api/cron/daily-digest: set CRON_SECRET, add a
 * second vercel.json "crons" entry pointing here (see .env.example and
 * /docs/launch-checklist). Shares src/lib/security/cron-secret.ts's
 * verification so both cron routes can never drift on the auth check.
 *
 * Dormant (mirrors the daily-digest cron's own notConfigured pattern) until
 * CRON_SECRET is set — a misconfigured deployment should show as a failing
 * cron run in Vercel's own dashboard, not silently report success while
 * never actually recovering anything. Unlike the digest, there is no single
 * "recipient env var" gate here — recovery emails go to the checkout
 * session's own customerEmail/lead.email, already required by the existing
 * manual actions, so a missing recipient is a per-session skip (surfaced in
 * the response body), not a whole-route 501.
 */

const CRON_CHECKOUT_RECOVERY_RATE_LIMIT: RateLimitConfig = { limit: 5, windowMs: 60_000 };

function notConfigured(message: string) {
  return NextResponse.json(
    {
      error: "Checkout recovery cron not configured",
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
  const rate = checkRateLimit(`cron-checkout-recovery:${clientIp}`, CRON_CHECKOUT_RECOVERY_RATE_LIMIT);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const nowMs = Date.now();

  try {
    const [sessions, leads, orders] = await Promise.all([
      listOpenCheckoutSessions(),
      getLeads(),
      listOrders(),
    ]);

    const bundleDue = listAbandonedCheckoutsDue(sessions, nowMs);
    const eligibleCommerceSlugs = leadSlugsEligibleForCommerceAbandonedRecovery(leads, orders);
    const commerceDue = listCommerceAbandonedCheckoutsDue(sessions, nowMs, eligibleCommerceSlugs);

    let sentCount = 0;
    const failures: Array<{ stripeSessionId: string; error: string }> = [];

    // Sequential, not Promise.all: each send goes through the same
    // mark-then-send CAS guard the manual dashboard button uses, and this
    // route's own expected volume (abandoned sessions for a single-operator
    // business) never approaches a scale where sequential sends matter for
    // latency.
    for (const session of bundleDue) {
      const result = await recoverAbandonedBundleCheckout(session);
      if (result.success) {
        sentCount += 1;
      } else {
        failures.push({ stripeSessionId: session.stripeSessionId, error: result.error });
      }
    }
    for (const session of commerceDue) {
      const result = await recoverAbandonedCommerceCheckout(session);
      if (result.success) {
        sentCount += 1;
      } else {
        failures.push({ stripeSessionId: session.stripeSessionId, error: result.error });
      }
    }

    const attempted = bundleDue.length + commerceDue.length;
    if (failures.length > 0) {
      await captureError(
        new Error(`checkout-recovery cron: ${failures.length} of ${attempted} recovery sends failed`),
        { component: "cron-checkout-recovery", failures },
      );
    }

    return NextResponse.json({ success: true, attempted, sent: sentCount, failed: failures.length, failures });
  } catch (error) {
    await captureError(error, { component: "cron-checkout-recovery" });
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
