/**
 * Dormant error-tracking scaffold (empty-backlog-tiers-1-5-clean-sweep-observability-gap-noted
 * tier-8 candidate). This repo has no error-tracking/observability tool
 * (Sentry, Datadog, Honeycomb, PostHog, LogRocket, etc.) — every failure path,
 * including the Stripe webhook handler's 190+ console.error/console.warn
 * sites, is only ever visible via whatever the hosting platform's raw log
 * retention happens to capture, with no aggregation, alerting, or queryable
 * index for a production payment-webhook failure, a Convex-outage SQLite
 * fallback trigger, or a Resend delivery failure.
 *
 * A real Sentry-equivalent SDK integration needs an operator-provided DSN —
 * the same operator-gated class as the other dormant scaffolds
 * (ALLOW_STRIPE_CONNECT_ONBOARDING, ALLOW_MARKETING_SCHEDULING) — and a
 * vendor-specific envelope format an agent should not guess at without that
 * vendor's own SDK. Instead this ships a vendor-agnostic generic webhook
 * sink: set ERROR_TRACKING_WEBHOOK_URL to any HTTP(S) endpoint that accepts a
 * JSON POST (a custom receiver, a Datadog/Honeycomb log-intake URL, a
 * Sentry-compatible ingestion proxy, etc.) and captureError best-effort POSTs
 * a structured payload there. Unlike the Connect/Buffer scaffolds this needs
 * no separate ALLOW_* opt-in flag — sending the app's own error diagnostics
 * to a URL the operator themselves configured carries no money-movement or
 * third-party-visible side effect, so the URL's presence is itself the
 * opt-in. Leaving ERROR_TRACKING_WEBHOOK_URL unset is a total no-op: callers
 * keep their existing console.error/console.warn exactly as before.
 *
 * captureError never throws and never blocks its caller for long — a slow or
 * unreachable tracking endpoint aborts after DEFAULT_ERROR_TRACKING_TIMEOUT_MS
 * rather than delaying a caller that itself needs to return promptly (e.g.
 * the Stripe webhook handler, which must still 5xx quickly enough for
 * Stripe's own delivery timeout to treat it as a retryable failure).
 */

export type EnvLike = NodeJS.ProcessEnv | Record<string, string | undefined>;

export type ErrorTrackingSeverity = "error" | "warning" | "info";

export type ErrorTrackingContext = {
  /** Which subsystem raised this, e.g. "stripe-webhook". Freeform, kebab-case by convention. */
  component: string;
  severity?: ErrorTrackingSeverity;
  [key: string]: unknown;
};

export type ErrorTrackingPayload = {
  message: string;
  stack?: string;
  component: string;
  severity: ErrorTrackingSeverity;
  timestamp: string;
  context: Record<string, unknown>;
};

/** Best-effort send timeout — never let a stuck tracking endpoint hang a caller. */
export const DEFAULT_ERROR_TRACKING_TIMEOUT_MS = 4000;

/** Soft cap on each individual context value once stringified (bounds payload size, mirrors the repo's free-text soft-cap convention). */
const MAX_CONTEXT_VALUE_LENGTH = 500;
/** Soft cap on stack trace length — some are enormous and add little past the first frames. */
const MAX_STACK_LENGTH = 2000;
/** Bounds how many context keys are forwarded, in case a caller passes something unbounded. */
const MAX_CONTEXT_KEYS = 20;

/** True when the operator has set a destination for error-tracking payloads on this deploy. */
export function isErrorTrackingConfigured(env: EnvLike = process.env): boolean {
  const url = env.ERROR_TRACKING_WEBHOOK_URL;
  return typeof url === "string" && url.trim().length > 0;
}

/** Truncate a single context value to a JSON-safe, bounded string/primitive. */
function sanitizeContextValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return value.length > MAX_CONTEXT_VALUE_LENGTH
      ? `${value.slice(0, MAX_CONTEXT_VALUE_LENGTH)}…`
      : value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  // Objects/arrays/functions/symbols: stringify once (never recurse — this is
  // diagnostic metadata, not a data export) and cap like any other string.
  let asString: string;
  try {
    asString = JSON.stringify(value) ?? String(value);
  } catch {
    asString = String(value);
  }
  return asString.length > MAX_CONTEXT_VALUE_LENGTH
    ? `${asString.slice(0, MAX_CONTEXT_VALUE_LENGTH)}…`
    : asString;
}

function sanitizeContext(rest: Record<string, unknown>): Record<string, unknown> {
  const entries = Object.entries(rest).slice(0, MAX_CONTEXT_KEYS);
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of entries) {
    sanitized[key] = sanitizeContextValue(value);
  }
  return sanitized;
}

/**
 * Pure payload builder — no I/O, no Date.now() (nowIso passed in), fully
 * unit-testable. `error` is treated as `unknown` since a catch binding can be
 * any thrown value, not only an Error instance.
 */
export function buildErrorTrackingPayload(
  error: unknown,
  context: ErrorTrackingContext,
  nowIso: string,
): ErrorTrackingPayload {
  const { component, severity = "error", ...rest } = context;
  const message = error instanceof Error ? error.message : String(error);
  const stack =
    error instanceof Error && typeof error.stack === "string"
      ? error.stack.length > MAX_STACK_LENGTH
        ? `${error.stack.slice(0, MAX_STACK_LENGTH)}…`
        : error.stack
      : undefined;
  return {
    message,
    stack,
    component,
    severity,
    timestamp: nowIso,
    context: sanitizeContext(rest),
  };
}

/**
 * Best-effort capture: no-ops when ERROR_TRACKING_WEBHOOK_URL is unset,
 * otherwise POSTs the built payload with a bounded timeout. Never throws —
 * any failure (bad URL, network error, non-2xx response, timeout) is
 * swallowed after a console.error, since this is diagnostic plumbing and
 * must never become a new way for the app itself to fail.
 */
export async function captureError(
  error: unknown,
  context: ErrorTrackingContext,
  env: EnvLike = process.env,
): Promise<void> {
  if (!isErrorTrackingConfigured(env)) return;

  const rawUrl = (env.ERROR_TRACKING_WEBHOOK_URL ?? "").trim();
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    console.error("ERROR_TRACKING_WEBHOOK_URL is not a valid URL — skipping error capture");
    return;
  }
  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    console.error("ERROR_TRACKING_WEBHOOK_URL must be http(s) — skipping error capture");
    return;
  }

  const payload = buildErrorTrackingPayload(error, context, new Date().toISOString());
  // Sent via the Authorization header, never appended to the URL — mirrors
  // buffer-token-header-not-query: a query-string secret is exactly what
  // generic HTTP-layer logging/tracing/proxy tooling captures by default.
  const secret = env.ERROR_TRACKING_WEBHOOK_SECRET?.trim();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_ERROR_TRACKING_TIMEOUT_MS);
  try {
    const response = await fetch(parsedUrl.toString(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(secret ? { authorization: `Bearer ${secret}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) {
      console.error(`Error-tracking webhook responded ${response.status}`);
    }
  } catch (sendError) {
    console.error("Failed to send error-tracking payload", sendError);
  } finally {
    clearTimeout(timeout);
  }
}
