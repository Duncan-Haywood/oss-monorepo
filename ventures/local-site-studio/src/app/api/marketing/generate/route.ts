import { NextResponse } from "next/server";
import { requireOperatorAuth } from "@/lib/auth/operator";
import { getMarketingGenerator } from "@/lib/marketing/generators";
import type {
  AutomationLevel,
  BusinessContext,
  GenerateMarketingRequest,
  MarketingContentType,
} from "@/lib/marketing/types";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/security/rate-limit";

const VALID_CONTENT_TYPES: MarketingContentType[] = [
  "gbp_post",
  "facebook_caption",
  "instagram_caption",
  "email_campaign",
  "review_request_email",
  "local_seo_meta",
  "seasonal_promo",
  "ad_copy",
];

const VALID_AUTOMATION_LEVELS: AutomationLevel[] = [
  "generate_only",
  "generate_schedule",
  "generate_schedule_optimize",
];

function isBusinessContext(value: unknown): value is BusinessContext {
  if (!value || typeof value !== "object") return false;
  const b = value as Record<string, unknown>;
  return (
    typeof b.businessName === "string" &&
    typeof b.category === "string" &&
    typeof b.city === "string" &&
    Array.isArray(b.services) &&
    b.services.every((s) => typeof s === "string")
  );
}

/**
 * POST /api/marketing/generate
 * Operator-authenticated ad-hoc generation. Prefer generateMarketingPackAction
 * on /dashboard/leads for the persisted monthly Growth/Complete pack.
 *
 * Auth + per-IP rate limit (defense-in-depth), because this route makes a
 * billed Anthropic call per request with caller-supplied prompt content.
 *
 * This comment used to read "when OPERATOR_DASHBOARD_PASSWORD is unset,
 * requireOperatorAuth returns ok for every caller". That stopped being true of
 * a deploy in f1f60d03: an unset or placeholder password in a production build
 * is now `locked-out` and requireOperatorAuth refuses unconditionally. It
 * returns ok for an unset password only in `open-demo` — a non-production
 * build — which is the documented `next dev` affordance. The stale sentence is
 * corrected rather than deleted because it was read as a live fail-open more
 * than once after the fix landed; see SEC-029 in docs/SECURITY_AUDIT_LOG.md.
 *
 * The limiter is still load-bearing and is not redundant with auth. It bounds
 * the open-demo window, and it is the only brake on spend once a real operator
 * *is* signed in. Its key derives from `x-forwarded-for`, which the caller
 * supplies — the open half of SEC-029. Mirrors bootstrap-prices (auth then
 * checkRateLimit).
 */
export async function POST(request: Request) {
  const auth = await requireOperatorAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const clientIp = clientIpFromHeaders(request.headers);
  const rate = checkRateLimit(`marketing-generate:${clientIp}`);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many requests", message: "Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Request body required" }, { status: 400 });
  }

  const payload = body as Record<string, unknown>;
  const leadId = payload.leadId;
  const contentTypes = payload.contentTypes;
  const automationLevel = payload.automationLevel;
  const business = payload.business;

  if (typeof leadId !== "string" || !leadId) {
    return NextResponse.json({ error: "leadId is required" }, { status: 400 });
  }

  if (!Array.isArray(contentTypes) || contentTypes.length === 0) {
    return NextResponse.json(
      { error: "contentTypes must be a non-empty array" },
      { status: 400 },
    );
  }

  const invalidTypes = contentTypes.filter(
    (t) =>
      typeof t !== "string" || !VALID_CONTENT_TYPES.includes(t as MarketingContentType),
  );
  if (invalidTypes.length > 0) {
    return NextResponse.json(
      { error: "Invalid contentTypes", invalid: invalidTypes },
      { status: 400 },
    );
  }

  if (
    typeof automationLevel !== "string" ||
    !VALID_AUTOMATION_LEVELS.includes(automationLevel as AutomationLevel)
  ) {
    return NextResponse.json(
      {
        error:
          "automationLevel must be generate_only, generate_schedule, or generate_schedule_optimize",
      },
      { status: 400 },
    );
  }

  if (!isBusinessContext(business)) {
    return NextResponse.json(
      {
        error: "business object required with businessName, category, city, services[]",
      },
      { status: 400 },
    );
  }

  const llmConfigured = Boolean(process.env.ANTHROPIC_API_KEY?.trim());

  const generateRequest: GenerateMarketingRequest = {
    leadId,
    contentTypes: contentTypes as MarketingContentType[],
    automationLevel: automationLevel as AutomationLevel,
    approvalMode:
      payload.approvalMode === "none" ||
      payload.approvalMode === "optional" ||
      payload.approvalMode === "required"
        ? payload.approvalMode
        : undefined,
    business,
  };

  const generator = getMarketingGenerator();
  const result = await generator.generate(generateRequest);
  const stub = result.variants.some((v) => v.body.startsWith("[Stub"));

  return NextResponse.json({
    ...result,
    stub,
    message: stub
      ? llmConfigured
        ? "LLM call failed or returned stub — check ANTHROPIC_API_KEY / logs"
        : "Set ANTHROPIC_API_KEY for LLM generation (stub used)"
      : "Generated via Anthropic",
    docs: "/docs/marketing-automation",
  });
}
