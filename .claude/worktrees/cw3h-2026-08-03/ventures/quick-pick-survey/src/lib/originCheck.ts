/**
 * Cross-site request forgery defence for the mutating API routes.
 *
 * The threat is narrow but real: a signed-in user opens some other page, and
 * that page's JavaScript posts to `/api/couple/join` or `/api/trials/answer`.
 * The browser attaches this app's session cookie because the cookie is
 * `SameSite=Lax`-by-default and the request is a top-level POST from another
 * origin, and the route sees a perfectly ordinary authenticated call. Nothing
 * here is worth stealing — but it is worth *writing to*: an attacker page
 * could burn a couple's invite code, plant answers into a partner's ranking,
 * or fire the anonymous session endpoint in a loop from real users' browsers,
 * which is the one route with no account behind it to rate-limit against.
 *
 * The check is the standard one: a cross-origin POST cannot forge the
 * `Origin` header, so a request that names an origin other than ours is
 * rejected before it reaches a handler.
 *
 * ## Requests with no `Origin` are allowed, deliberately
 *
 * Browsers always send `Origin` on POST — same-origin included, since the
 * Fetch standard made it unconditional for state-changing methods. So the
 * absence of the header means the caller is not a browser: curl, a script,
 * the integration suite. Those cannot be CSRF vectors, because CSRF is
 * entirely about a browser holding a cookie the attacker cannot read.
 * Rejecting them would break the admin export and every non-browser client
 * to protect against nothing.
 *
 * `Sec-Fetch-Site` closes the other half: browsers send it on every request,
 * so `cross-site` is a browser telling us directly, and it is rejected even
 * when `Origin` is missing.
 *
 * This is an origin check, not authorisation. It says "this request was made
 * from our own pages"; who is making it is still `getSessionUser`'s job.
 */

/** Methods that can change state. Everything else passes through untouched. */
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export type OriginVerdict = { allowed: true } | { allowed: false; reason: string };

/**
 * The host this request believes it arrived at.
 *
 * `x-forwarded-host` wins because behind Vercel's proxy `host` is the
 * internal hostname. Both headers come from the proxy rather than the page
 * that made the request: a cross-site `fetch` cannot set either without
 * triggering a preflight, and the preflight has no CORS headers to satisfy
 * it. Spoofing them therefore requires a non-browser client, which was never
 * the threat.
 */
function expectedHost(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-host");
  if (forwarded) return forwarded.split(",")[0].trim().toLowerCase() || null;
  const host = headers.get("host");
  return host ? host.trim().toLowerCase() : null;
}

export function checkOrigin(method: string, headers: Headers): OriginVerdict {
  if (!MUTATING.has(method.toUpperCase())) return { allowed: true };

  // A browser saying so itself. Checked before `Origin` so that a
  // cross-site request cannot get in by simply omitting the header.
  const site = headers.get("sec-fetch-site");
  if (site === "cross-site") return { allowed: false, reason: "cross-site request" };

  const origin = headers.get("origin");
  if (!origin) return { allowed: true }; // not a browser — see the note above

  // Sandboxed iframes and some redirect chains send the literal string
  // "null". It cannot be shown to be ours, so it is not treated as ours.
  if (origin === "null") return { allowed: false, reason: "opaque origin" };

  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return { allowed: false, reason: "unparseable origin" };
  }

  const host = expectedHost(headers);
  if (!host) return { allowed: false, reason: "no host to compare against" };
  if (originHost !== host) return { allowed: false, reason: "origin does not match host" };

  return { allowed: true };
}
