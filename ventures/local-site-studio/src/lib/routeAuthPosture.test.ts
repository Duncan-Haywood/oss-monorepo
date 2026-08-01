import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Every API route handler this app serves declares whether it answers anonymous
 * callers, and that declaration is checked against what the code actually does.
 *
 * Unlike ai-first-markets and photo-editing/docs-site, this venture does not
 * guard API routes in the proxy. `src/proxy.ts` matches nearly every path, but
 * its only gate is `dashboardAuthGate`, and that returns early unless the path
 * is `/dashboard` or under it. Everything under `/api` therefore reaches its
 * handler anonymously, and the guard — where there is one — is the handler's
 * own `requireOperatorAuth()` call. That makes a missing guard invisible: there
 * is no deny-by-default to fall back on, so a new route ships public unless its
 * author remembers. This contract is the reminder: a new handler fails until it
 * is listed below, and a handler declared `operator` fails if it stops calling
 * the guard.
 *
 * What this checks is reachability and the presence of the guard — whether an
 * anonymous request gets to the handler, and whether the handler turns it away.
 * It does not check what an authorized handler then does with the request.
 *
 * Two limits worth naming rather than hiding:
 *
 *  - `requireOperatorAuth()` is open when `OPERATOR_DASHBOARD_PASSWORD` is
 *    unset, by design, so local demos work (see `src/lib/auth/operator.ts`).
 *    A handler declared `operator` is only actually guarded in an environment
 *    that sets the password. `operator-auth-env-readiness.test.ts` is what
 *    covers that; this contract covers the call site.
 *  - Several `public` handlers authenticate the *request* rather than the
 *    caller — a Stripe signature, an HMAC unsubscribe token, a Stripe session
 *    id. That is a real control, and the reason field has to say which one it
 *    is. "It is public" is not a reason.
 */

const APP_ROOT = join(process.cwd(), "src/app");
const API_ROOT = join(APP_ROOT, "api");
const PROXY = join(process.cwd(), "src/proxy.ts");

type Posture = "public" | "operator";

/**
 * The declared auth posture of every API handler, as `<path> <METHOD>`.
 *
 * `public` means an anonymous caller reaches the handler by design, and the
 * reason must name what makes that safe. `operator` means the handler must
 * refuse a caller without an operator session.
 */
const POSTURE: Record<string, { posture: Posture; reason: string }> = {
  "/api/commerce/checkout POST": {
    posture: "public",
    reason:
      "Storefront checkout for a synced Commerce SKU; anonymous shoppers are the entire audience. It resolves the price server-side from the persisted catalog rather than from the request body, so a tampered payload cannot buy below the stored price, and it is per-IP rate limited against session churn.",
  },
  "/api/contact/[slug] POST": {
    posture: "public",
    reason:
      "The visitor contact form on a lead's preview site, which has no accounts and no sessions. It writes an inquiry and truncates what it stores; it reads back nothing about the lead beyond the business name already rendered on the public page.",
  },
  "/api/contact/[slug] GET": {
    posture: "public",
    reason:
      "A self-description of the POST above — accepted methods, content types and field names, plus a docs link. Every value in the body is a constant in the source; it reads no inquiry, no lead and no configuration, so it discloses only what the public form markup already does.",
  },
  "/api/marketing/generate POST": {
    posture: "operator",
    reason:
      "Ad-hoc marketing generation against the Anthropic API on the operator's account. Unauthenticated access is both a data path into lead records and an unbounded spend path.",
  },
  "/api/preview/[slug]/open POST": {
    posture: "public",
    reason:
      "An attribution beacon fired by the preview page a prospect opens from an outreach email, before any relationship exists — a session cannot be required. It records a timestamp against a slug the caller already had, answers an unknown slug with the same shape as a known one, and is both debounced per lead and rate limited per IP.",
  },
  "/api/stripe/billing-portal POST": {
    posture: "public",
    reason:
      "Returns a Stripe billing-portal URL for a checkout session the caller identifies by id. The session id is the credential — it is issued to the purchaser at checkout and is not derivable — and the return URL is forced same-origin, so this cannot be turned into a redirect. Rate limited per IP against id guessing.",
  },
  "/api/stripe/bootstrap-prices POST": {
    posture: "operator",
    reason:
      "Creates products and prices in the connected Stripe account. This mutates live commerce configuration and must never answer an anonymous caller.",
  },
  "/api/stripe/checkout POST": {
    posture: "public",
    reason:
      "Bundle checkout from the public pricing page; buyers have no account before they pay. The tier is resolved server-side from the BUNDLES table rather than from the body, missing configuration returns 501 instead of a half-built session, and it is per-IP rate limited.",
  },
  "/api/stripe/webhook POST": {
    posture: "public",
    reason:
      "Stripe calls this server-to-server with no session available. It authenticates the request instead of the caller: stripe.webhooks.constructEvent verifies the signature against STRIPE_WEBHOOK_SECRET and an unsigned or mis-signed payload is rejected before any handling.",
  },
  "/api/unsubscribe GET": {
    posture: "public",
    reason:
      "CAN-SPAM one-click unsubscribe, reached from an email footer by a recipient who has no account. The link carries an HMAC token that verifyUnsubscribeToken checks, so a guessed address alone cannot suppress it, and the rate limiter runs before the HMAC so scripted traffic cannot burn the work either.",
  },
};

/** Every route module under src/app/api, as served URL path -> source. */
function routeSources(dir: string = API_ROOT, prefix = "/api"): Map<string, string> {
  const found = new Map<string, string>();
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const entryPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Route groups `(name)` organize files without appearing in the URL.
      const segment = /^\(.*\)$/.test(entry.name) ? "" : `/${entry.name}`;
      for (const [name, source] of routeSources(entryPath, `${prefix}${segment}`)) {
        found.set(name, source);
      }
    } else if (/^route\.(ts|tsx)$/.test(entry.name)) {
      found.set(prefix, readFileSync(entryPath, "utf8"));
    }
  }
  return found;
}

/**
 * Splits a route module into its exported HTTP handlers, as method -> body.
 * The last handler's body runs to the end of the file, which is fine: what is
 * asked of a body is only whether the guard appears in it.
 */
function handlers(source: string): Map<string, string> {
  const found = new Map<string, string>();
  const starts = [
    ...source.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+([A-Z]+)\b/g),
  ];
  starts.forEach((match, index) => {
    const from = match.index ?? 0;
    const to =
      index + 1 < starts.length ? (starts[index + 1].index ?? source.length) : source.length;
    found.set(match[1], source.slice(from, to));
  });
  return found;
}

function declaredHandlers(): Map<string, string> {
  const found = new Map<string, string>();
  for (const [routePath, source] of routeSources()) {
    for (const [method, body] of handlers(source)) {
      found.set(`${routePath} ${method}`, body);
    }
  }
  return found;
}

describe("route auth posture", () => {
  it("finds route handlers at all", () => {
    // A scan that silently returns nothing would make every check below pass.
    const found = declaredHandlers();
    expect(
      found.size,
      `No route handlers found under ${relative(process.cwd(), API_ROOT)}. ` +
        "Either the app directory moved or the handler pattern changed; " +
        "this contract checks nothing until that is fixed.",
    ).toBeGreaterThan(0);
  });

  it("every route handler declares an auth posture", () => {
    const undeclared = [...declaredHandlers().keys()].filter((name) => !(name in POSTURE));
    expect(
      undeclared,
      "These handlers answer requests without declaring whether an anonymous " +
        "caller may reach them. Nothing under /api is gated by the proxy, so an " +
        "undeclared handler is a public one. Add each to POSTURE in " +
        "src/lib/routeAuthPosture.test.ts:\n  " +
        undeclared.join("\n  "),
    ).toEqual([]);
  });

  it("no declaration outlives the handler it describes", () => {
    const live = declaredHandlers();
    const stale = Object.keys(POSTURE).filter((name) => !live.has(name));
    expect(
      stale,
      "These declarations describe handlers that no longer exist. A stale entry " +
        "reads as coverage and covers nothing:\n  " + stale.join("\n  "),
    ).toEqual([]);
  });

  it("every declaration gives a reason a reviewer can check", () => {
    const thin = Object.entries(POSTURE)
      .filter(([, { reason }]) => reason.trim().length < 60)
      .map(([name]) => name);
    expect(
      thin,
      "A posture without a stated reason is an assertion, not a decision. " +
        "Name what makes anonymous access safe, or what the handler protects:\n  " +
        thin.join("\n  "),
    ).toEqual([]);
  });

  it("every handler declared operator actually calls the guard", () => {
    const unguarded: string[] = [];
    for (const [name, body] of declaredHandlers()) {
      if (POSTURE[name]?.posture !== "operator") continue;
      if (!/requireOperatorAuth\s*\(/.test(body)) {
        unguarded.push(`${name} — no requireOperatorAuth() call in the handler body`);
      } else if (!/\bauth\.ok\b|\b!auth\.ok\b/.test(body)) {
        unguarded.push(`${name} — calls requireOperatorAuth() but never checks the result`);
      }
    }
    expect(
      unguarded,
      "These handlers are declared operator-only and are not:\n  " + unguarded.join("\n  "),
    ).toEqual([]);
  });

  it("no handler declared public quietly grew a guard", () => {
    // Not a security failure — a documentation one, and the direction that
    // rots quietly. A handler that gained a guard has changed who it serves.
    const drifted: string[] = [];
    for (const [name, body] of declaredHandlers()) {
      if (POSTURE[name]?.posture !== "public") continue;
      if (/requireOperatorAuth\s*\(/.test(body)) {
        drifted.push(`${name} — declared public but calls requireOperatorAuth()`);
      }
    }
    expect(
      drifted,
      "Update the declaration to match the code:\n  " + drifted.join("\n  "),
    ).toEqual([]);
  });

  it("the proxy still leaves /api to the handlers", () => {
    // The whole model above rests on this. If /api ever gains a proxy-level
    // gate, "declared public" stops meaning "reachable" and these declarations
    // have to be rewritten against the gate instead of against the handler.
    const source = readFileSync(PROXY, "utf8");
    const gated = [...source.matchAll(/pathname\s*(?:===|\.startsWith\()\s*"([^"]+)"/g)].map(
      (match) => match[1],
    );

    expect(
      gated.length,
      "src/proxy.ts no longer gates any path by literal prefix. This contract " +
        "cannot tell what the proxy does with /api; re-read it and rewrite this " +
        "check before trusting the declarations above.",
    ).toBeGreaterThan(0);

    const apiGates = gated.filter((path) => path === "/api" || path.startsWith("/api/"));
    expect(
      apiGates,
      "src/proxy.ts now gates paths under /api. That is likely an improvement, " +
        "but it changes what this contract is checking: the declarations above " +
        "describe handler-level guards on the assumption that nothing stops an " +
        "anonymous request before the handler. Rewrite them against the proxy " +
        "rule, as ai-first-markets and docs-site do:\n  " + apiGates.join("\n  "),
    ).toEqual([]);
  });
});
