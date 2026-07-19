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
export function requireApiSecret(secret: string): void {
  const expected = process.env.CONVEX_API_SECRET;
  if (!expected || secret !== expected) {
    throw new Error("Unauthorized: missing or invalid Convex apiSecret.");
  }
}
