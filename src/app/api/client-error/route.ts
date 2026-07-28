import { NextResponse } from "next/server";
import { captureError } from "@/lib/observability/error-tracking";
import { readJsonBodyWithByteLimit } from "@/lib/security/json-body";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/security/rate-limit";

type ClientErrorReportBody = {
  message?: unknown;
  stack?: unknown;
  digest?: unknown;
  boundary?: unknown;
  path?: unknown;
};

/**
 * Public beacon: forwards a client-side React error-boundary catch
 * (src/app/error.tsx, src/app/global-error.tsx) into the same captureError
 * observability scaffold every server-side failure path already reports
 * through — see /docs/architecture#observability. Every prior captureError
 * sweep in this codebase only ever covered server-side catches; a render
 * failure inside a Client Component (or any client-side interaction that
 * throws) previously had zero path to ERROR_TRACKING_WEBHOOK_URL at all,
 * visible only via whatever the browser's own console happened to capture
 * for that one visitor.
 *
 * Unauthenticated by necessity — an error boundary can mount before any
 * session/auth state exists, and global-error.tsx in particular replaces
 * the root layout entirely while active — so this is rate-limited and
 * body-size-bounded like every other public write route (checkRateLimit,
 * readJsonBodyWithByteLimit), mirroring the preview-open beacon's own
 * shape. The response never reveals whether error tracking is configured,
 * and this route always resolves 200 with a fixed body: a malformed,
 * oversized, or otherwise unreportable payload must never give the calling
 * boundary a reason to retry or surface a second error — global-error.tsx's
 * own doc comment notes it has no boundary above it to catch a secondary
 * failure, so the client-side call site treats this as fire-and-forget too
 * (see error.tsx / global-error.tsx's useEffect).
 */
export async function POST(request: Request) {
  const clientIp = clientIpFromHeaders(request.headers);
  const rate = checkRateLimit(`client-error:${clientIp}`);
  if (!rate.allowed) {
    return NextResponse.json(
      { ok: false, reason: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  const parsed = await readJsonBodyWithByteLimit<ClientErrorReportBody>(request);
  if (!parsed.ok) {
    // Malformed / empty / over-large body — still 200. This is a best-effort
    // diagnostic beacon, not a contract the client needs to handle a failure
    // response for; readJsonBodyWithByteLimit already bounded the read.
    return NextResponse.json({ ok: true });
  }

  const body = parsed.value ?? {};
  const message =
    typeof body.message === "string" && body.message.trim().length > 0
      ? body.message
      : "Unknown client error";
  // Reconstruct a real Error so buildErrorTrackingPayload's own
  // `error instanceof Error` branch (message/stack extraction + length caps)
  // runs exactly as it does for every server-side captureError call site —
  // never hand-build the tracking payload here and bypass those caps.
  const error = new Error(message);
  if (typeof body.stack === "string" && body.stack.trim().length > 0) {
    error.stack = body.stack;
  }

  await captureError(error, {
    component: "client-error-boundary",
    boundary: typeof body.boundary === "string" ? body.boundary : "unknown",
    digest: typeof body.digest === "string" ? body.digest : undefined,
    path: typeof body.path === "string" ? body.path : undefined,
  });

  return NextResponse.json({ ok: true });
}
