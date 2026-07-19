/**
 * Every Convex query/mutation built with the plain `query`/`mutation`
 * builders (not `internalQuery`/`internalMutation`) is a public HTTP-callable
 * RPC reachable by anyone who knows the deployment URL and function name —
 * Convex has no implicit "only my server calls this" protection. This app's
 * only Convex caller is src/lib/db.ts, using a bare ConvexHttpClient with no
 * admin/auth token (internal functions aren't callable from that client, so
 * internalMutation/internalQuery is not a drop-in fix here — see
 * AGENT_PROTOCOL). requireApiSecret is the mitigation: every protected
 * function takes an explicit apiSecret arg and rejects unless it matches the
 * CONVEX_API_SECRET environment variable configured on the Convex deployment
 * (set via the Convex dashboard or `npx convex env set`) — db.ts sends the
 * matching value from its own server-only (non-NEXT_PUBLIC_) env var of the
 * same name. Fails closed: an unset CONVEX_API_SECRET rejects every caller,
 * including one that happens to send an empty string.
 */

/**
 * Constant-time-ish string compare, reimplemented rather than reusing
 * node:crypto's timingSafeEqual (src/lib/auth/operator.ts's passwordsMatch)
 * because this file is imported by every convex/*.ts query/mutation module —
 * Convex's default runtime only allows Node built-ins in files marked
 * `"use node"`, and that directive is action-only (query/mutation builders
 * reject it at deploy time), so a Node crypto import here would break every
 * migrated file. Always walks the full max(a.length, b.length) — never
 * short-circuits on the first mismatched character — so a timing side
 * channel can't be used to guess the secret one byte at a time.
 */
function constantTimeStringEqual(a: string, b: string): boolean {
  const maxLength = Math.max(a.length, b.length);
  let diff = a.length === b.length ? 0 : 1;
  for (let i = 0; i < maxLength; i++) {
    const charA = i < a.length ? a.charCodeAt(i) : 0;
    const charB = i < b.length ? b.charCodeAt(i) : 0;
    diff |= charA ^ charB;
  }
  return diff === 0;
}

export function requireApiSecret(secret: string): void {
  const expected = process.env.CONVEX_API_SECRET;
  if (!expected || !constantTimeStringEqual(secret, expected)) {
    throw new Error("Unauthorized: missing or invalid Convex apiSecret.");
  }
}
