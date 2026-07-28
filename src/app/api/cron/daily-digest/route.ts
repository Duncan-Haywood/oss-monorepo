import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { sendOperatorDigestEmail } from "@/lib/digest/send-operator-digest";
import { captureError } from "@/lib/observability/error-tracking";
import { resolveTrustedAppUrl } from "@/lib/security/app-url";
import { checkRateLimit, clientIpFromHeaders, type RateLimitConfig } from "@/lib/security/rate-limit";

/**
 * Automated daily trigger for the operator digest — see
 * operator-daily-digest-cron-automation in BUSINESS_DECISIONS for why this
 * exists: sendDailyDigestAction (src/app/dashboard/leads/actions.ts) was, until
 * this route shipped, the digest's ONLY trigger, requiring the operator to
 * remember to open /dashboard/leads and click a button — the one mechanism
 * built to make that unnecessary could never actually fire unattended.
 *
 * Enabled by setting CRON_SECRET and wiring a vercel.json "crons" entry (see
 * .env.example and /docs/launch-checklist) to call this route once daily.
 * Vercel automatically sends CRON_SECRET as `Authorization: Bearer <secret>`
 * to cron-invoked routes when the env var is named exactly CRON_SECRET — no
 * OAuth, no third-party approval, no legal review, unlike the operator/legal
 * -gated NEXT_STEPS items.
 *
 * Dormant (mirrors src/app/api/resend/webhook/route.ts's notConfigured
 * pattern) until BOTH CRON_SECRET and OPERATOR_DIGEST_EMAIL are set — a
 * misconfigured deployment should show as a failing cron run in Vercel's own
 * dashboard, not silently report success while never actually sending
 * anything.
 */

const CRON_DAILY_DIGEST_RATE_LIMIT: RateLimitConfig = { limit: 5, windowMs: 60_000 };

// Hard ceiling before Buffer.from/timingSafeEqual — mirrors
// MAX_OPERATOR_PASSWORD_LENGTH (src/lib/auth/operator.ts): rate-limiting
// blunts attempt count, not per-attempt payload size, and a genuine
// CRON_SECRET is a short generated token.
const MAX_CRON_SECRET_LENGTH = 256;

function cronSecretMatches(provided: string, expected: string): boolean {
  if (provided.length > MAX_CRON_SECRET_LENGTH) {
    return false;
  }
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) {
    // Still run a compare to reduce trivial timing leaks on length mismatch.
    timingSafeEqual(expectedBuffer, expectedBuffer);
    return false;
  }
  return timingSafeEqual(providedBuffer, expectedBuffer);
}

function notConfigured(message: string) {
  return NextResponse.json(
    {
      error: "Daily digest cron not configured",
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

  const authHeader = request.headers.get("authorization") ?? "";
  const provided = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  if (!provided || !cronSecretMatches(provided, cronSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Defense in depth against a leaked/misconfigured secret being replayed —
  // Vercel Cron itself only calls this once daily, so this never blocks a
  // legitimate invocation.
  const clientIp = clientIpFromHeaders(request.headers);
  const rate = checkRateLimit(`cron-daily-digest:${clientIp}`, CRON_DAILY_DIGEST_RATE_LIMIT);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const digestEmail = process.env.OPERATOR_DIGEST_EMAIL?.trim();
  if (!digestEmail) {
    return notConfigured("Set OPERATOR_DIGEST_EMAIL (see .env.example) to enable the daily digest.");
  }

  const appUrl = resolveTrustedAppUrl(request.headers, process.env.NEXT_PUBLIC_APP_URL);

  try {
    const result = await sendOperatorDigestEmail(digestEmail, appUrl);
    if (!result.success) {
      await captureError(new Error(result.error), { component: "cron-daily-digest" });
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }
    return NextResponse.json({ success: true, mock: result.mock });
  } catch (error) {
    await captureError(error, { component: "cron-daily-digest" });
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
