import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

/**
 * Operator authorization for internal API routes.
 *
 * Some routes under `src/app/api` exist for whoever runs this business, not for
 * whoever finds the URL: they report which partner credentials are configured,
 * reconcile payouts, and trigger outbound syncs that spend real ad budget. The
 * venture has no login, so until it grows one these routes are gated on a shared
 * operator token supplied as `Authorization: Bearer <token>`.
 *
 * Two properties matter more than the mechanism:
 *
 * 1. **It fails closed.** An unset `PRINT_ATELIER_OPS_TOKEN` denies every
 *    request. The tempting alternative — treat "no token configured" as "auth
 *    not required yet" — makes the first deploy to a real host silently public,
 *    which is precisely the state this guard was added to end.
 * 2. **Comparison is timing-safe and length-blind.** Tokens are compared as
 *    SHA-256 digests so neither the value nor its length leaks through response
 *    timing.
 */

export const OPS_TOKEN_ENV = "PRINT_ATELIER_OPS_TOKEN";

export type OperatorDenial = {
  status: number;
  error: string;
  hint: string;
};

type EnvSource = Record<string, string | undefined>;

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/**
 * Extracts the token from an `Authorization` header, or null when the header is
 * absent or is not a well-formed bearer credential.
 */
export function readBearerToken(header: string | null | undefined): string | null {
  if (!header) {
    return null;
  }
  const match = /^Bearer[ \t]+(\S+)$/.exec(header.trim());
  return match ? match[1] : null;
}

/**
 * The authorization decision, with no framework types involved so it can be
 * tested directly. Returns null when the caller is authorized.
 */
export function checkOperator(
  authorizationHeader: string | null | undefined,
  env: EnvSource,
): OperatorDenial | null {
  const expected = (env[OPS_TOKEN_ENV] ?? "").trim();
  if (expected.length === 0) {
    return {
      status: 503,
      error: "Operator API is not configured",
      hint: `Set ${OPS_TOKEN_ENV} to a random secret. Until it is set this route refuses every request rather than serving configuration state to anonymous callers.`,
    };
  }

  const presented = readBearerToken(authorizationHeader);
  // A missing header and a wrong token give the same answer on purpose: telling
  // an anonymous caller which one they got wrong is free reconnaissance.
  if (presented === null || !timingSafeEqual(digest(presented), digest(expected))) {
    return {
      status: 401,
      error: "Not authorised",
      hint: `Send \`Authorization: Bearer <${OPS_TOKEN_ENV}>\`.`,
    };
  }

  return null;
}

/**
 * Route-handler wrapper. Returns a response to return immediately, or null when
 * the request may proceed.
 */
export function requireOperator(
  request: Request,
  env: EnvSource = process.env,
): NextResponse | null {
  const denial = checkOperator(request.headers.get("authorization"), env);
  if (!denial) {
    return null;
  }
  return NextResponse.json(
    { error: denial.error, hint: denial.hint },
    { status: denial.status },
  );
}
