import { afterEach, describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Every route handler this app serves declares who may reach it, and that
 * declaration is checked against the guard the handler actually calls.
 *
 * This venture has no middleware. Nothing sits in front of a handler, so a
 * route is exactly as protected as its own body makes it, and a new file under
 * `src/app/api` that forgets its guard is indistinguishable from one that has
 * it.
 *
 * Most routes here are anonymous by necessity — this is a lead-generation and
 * checkout surface, and a stranger clicking a link in a proposal email is the
 * customer. So "public" is the common case rather than the alarming one, and
 * what each public route needs is a named thing standing in for a session: an
 * IP rate limit, a Stripe signature, a signed unsubscribe token, or a Stripe
 * session id the caller could only have if they completed a checkout.
 *
 * What this checks is which callers a handler serves. It does not check what
 * the handler then does with the request.
 */

const APP_ROOT = join(process.cwd(), "src/app");
const OPERATOR_AUTH = join(process.cwd(), "src/lib/auth/operator.ts");

type Posture =
  /** Answered without credentials, and holds nothing back. */
  | "public"
  /** Anonymous by design, but the handler must be throttled per client IP. */
  | "public-throttled"
  /** Anonymous, but authorized by a Stripe webhook signature. */
  | "signature-verified"
  /** Anonymous, but authorized by a signed token in the URL. */
  | "token-verified"
  /** Refuses without an operator session — see the caveat below. */
  | "operator";

/** The symbol a handler must call to earn each posture. */
const REQUIRED_GUARD: Record<Exclude<Posture, "public">, RegExp> = {
  "public-throttled": /checkRateLimit/,
  "signature-verified": /webhooks\.constructEvent/,
  "token-verified": /verifyUnsubscribeToken/,
  operator: /requireOperatorAuth/,
};

const POSTURE: Record<string, { posture: Posture; reason: string }> = {
  // --- Operator-only -----------------------------------------------------
  "/api/marketing/generate POST": {
    posture: "operator",
    reason: "Generates outbound marketing copy; costs money per call.",
  },
  "/api/stripe/bootstrap-prices POST": {
    posture: "operator",
    reason: "Creates Stripe Price objects on the live account.",
  },

  // --- Authorized by something other than a session ----------------------
  "/api/stripe/webhook POST": {
    posture: "signature-verified",
    reason:
      "Stripe is the caller and cannot hold a session cookie. Authorization is the stripe-signature header, verified against STRIPE_WEBHOOK_SECRET by constructEvent before the payload is read, so a forged fulfilment event is rejected before it can mark an order paid.",
  },
  "/api/unsubscribe GET": {
    posture: "token-verified",
    reason:
      "Reached from a link in an email by someone who has no account and never will, which is exactly the person who most needs it to work. Authorization is the HMAC token bound to that address, so one recipient cannot unsubscribe another, and the limiter is checked before the token so the token cannot be brute-forced.",
  },

  // --- Anonymous, throttled ----------------------------------------------
  "/api/commerce/checkout POST": {
    posture: "public-throttled",
    reason:
      "A buyer starting checkout has no account yet — that is what checkout is for. It creates a Stripe session from a catalog entry the server resolves, so price comes from the server, not the caller, and it is rate limited per IP.",
  },
  "/api/stripe/checkout POST": {
    posture: "public-throttled",
    reason:
      "The bundle equivalent of the above, and public for the same reason. The bundle is resolved server-side through getBundle so the caller cannot name their own price, and it is rate limited per IP.",
  },
  "/api/stripe/billing-portal POST": {
    posture: "public-throttled",
    reason:
      "Opens the Stripe billing portal for a checkout session id. The session id is the capability — only someone who completed that checkout has it — and there is no account system here to check instead. Rate limited per IP so ids cannot be guessed at in bulk.",
  },
  "/api/contact/[slug] POST": {
    posture: "public-throttled",
    reason:
      "The contact form on a prospect's own preview site. Its entire purpose is to be submitted by a stranger who has never seen this app before. The slug is validated, the lead is resolved server-side, and submissions are rate limited per IP.",
  },
  "/api/preview/[slug]/open POST": {
    posture: "public-throttled",
    reason:
      "Records that a prospect opened their preview, fired by the preview page itself before anyone signs in. It writes one timestamp against a slug and reads nothing back to the caller; rate limited per IP.",
  },

  // --- Fully open --------------------------------------------------------
  "/api/contact/[slug] GET": {
    posture: "public",
    reason:
      "Self-describing documentation for the POST above — the method, the accepted content types and the field names. It is a fixed object built from the slug in the URL; it performs no lookup and returns nothing about the lead.",
  },
};

/** Every route module under src/app, as served URL path → source. */
function routeSources(dir = APP_ROOT, prefix = ""): Map<string, string> {
  const found = new Map<string, string>();
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Route groups `(name)` organize files without appearing in the URL.
      const segment = /^\(.*\)$/.test(entry.name) ? "" : `/${entry.name}`;
      for (const [name, source] of routeSources(path, `${prefix}${segment}`)) {
        found.set(name, source);
      }
    } else if (entry.name === "route.ts" || entry.name === "route.tsx") {
      found.set(prefix, readFileSync(path, "utf8"));
    }
  }
  return found;
}

/** Splits a route module into its exported HTTP handlers, as method → body. */
function handlers(source: string): Map<string, string> {
  const found = new Map<string, string>();
  const starts = [...source.matchAll(/export (?:async )?function ([A-Z]+)\s*\(/g)];
  starts.forEach((match, index) => {
    const from = match.index ?? 0;
    const to = index + 1 < starts.length ? (starts[index + 1].index ?? source.length) : source.length;
    found.set(match[1], source.slice(from, to));
  });
  return found;
}

function everyHandler(): Map<string, string> {
  const found = new Map<string, string>();
  for (const [path, source] of routeSources()) {
    for (const [method, body] of handlers(source)) {
      found.set(`${path} ${method}`, body);
    }
  }
  return found;
}

describe("route auth posture", () => {
  it("every route handler declares one", () => {
    const undeclared = [...everyHandler().keys()].filter((name) => !(name in POSTURE));
    expect(undeclared.sort()).toEqual([]);
  });

  it("declares nothing for a handler that no longer exists", () => {
    const real = everyHandler();
    expect(Object.keys(POSTURE).filter((name) => !real.has(name))).toEqual([]);
  });

  it("each guarded handler calls the guard its posture names", () => {
    // The declaration is a claim about the body. Without this a handler could
    // keep its label after the guard was deleted.
    const real = everyHandler();
    const missing: string[] = [];
    for (const [name, { posture }] of Object.entries(POSTURE)) {
      if (posture === "public") continue;
      const body = real.get(name);
      if (body && !REQUIRED_GUARD[posture].test(body)) {
        missing.push(`${name}: declared ${posture}, body never calls ${REQUIRED_GUARD[posture].source}`);
      }
    }
    expect(missing.sort()).toEqual([]);
  });

  it("each operator handler refuses rather than continuing past the check", () => {
    // Calling requireOperatorAuth is not the same as acting on the answer.
    const real = everyHandler();
    const permissive: string[] = [];
    for (const [name, { posture }] of Object.entries(POSTURE)) {
      if (posture !== "operator") continue;
      const body = real.get(name) ?? "";
      if (!/status:\s*401/.test(body)) {
        permissive.push(`${name}: declared operator, but never answers 401`);
      }
    }
    expect(permissive.sort()).toEqual([]);
  });

  it("every public handler carries a reason naming why anonymous access is safe", () => {
    for (const [name, { posture, reason }] of Object.entries(POSTURE)) {
      if (posture !== "public") continue;
      expect(reason.trim().length, `${name} needs a reason, not just the label`).toBeGreaterThan(40);
    }
  });

  it("finds the routes at all, so an empty pass cannot look like a green one", () => {
    expect(everyHandler().size).toBeGreaterThanOrEqual(10);
  });

  it("separates handlers rather than returning one blob per file", () => {
    // /api/contact/[slug] really does export both GET and POST, with different
    // postures. A parser returning the whole file would let one vouch for the
    // other.
    const parsed = handlers(
      [
        "export async function POST(request: Request) {",
        "  const rate = checkRateLimit('x');",
        "}",
        "export async function GET(_request: Request) {",
        "  return NextResponse.json({});",
        "}",
      ].join("\n"),
    );
    expect([...parsed.keys()]).toEqual(["POST", "GET"]);
    expect(parsed.get("GET")).not.toContain("checkRateLimit");
  });

  it("reads the directory the app actually serves", () => {
    expect(relative(process.cwd(), APP_ROOT)).toBe(join("src", "app"));
    expect(readFileSync(OPERATOR_AUTH, "utf8")).toContain("export async function requireOperatorAuth");
  });
});

describe("what the operator posture is worth", () => {
  // requireOperatorAuth admits every caller when OPERATOR_DASHBOARD_PASSWORD is
  // unset, so that local demos work without configuration. That is deliberate
  // and documented in operator.ts — but it means the two `operator` postures
  // above are claims about a deployment, not about the code, and today it is a
  // comment rather than anything that fails. These tests state the condition in
  // a form that cannot be missed: if the fail-open is ever removed, the first
  // one goes red and this block should be deleted along with the comment.
  const original = process.env.OPERATOR_DASHBOARD_PASSWORD;
  afterEach(() => {
    if (original === undefined) delete process.env.OPERATOR_DASHBOARD_PASSWORD;
    else process.env.OPERATOR_DASHBOARD_PASSWORD = original;
  });

  it("admits an anonymous caller when no operator password is configured", async () => {
    delete process.env.OPERATOR_DASHBOARD_PASSWORD;
    const { isOperatorAuthConfigured } = await import("@/lib/auth/operator");
    // Deployments that serve real lead data must set this. Nothing in the
    // repository enforces it, so it belongs on the launch checklist and here.
    expect(isOperatorAuthConfigured()).toBe(false);
  });

  it("reports itself configured once the password is set", async () => {
    process.env.OPERATOR_DASHBOARD_PASSWORD = "not-the-real-one";
    const { isOperatorAuthConfigured } = await import("@/lib/auth/operator");
    expect(isOperatorAuthConfigured()).toBe(true);
  });

  it("refuses a forged or missing session token once configured", async () => {
    const { verifyOperatorSessionToken, createOperatorSessionToken } = await import("@/lib/auth/operator");
    const password = "not-the-real-one";
    expect(verifyOperatorSessionToken(undefined, password)).toBe(false);
    expect(verifyOperatorSessionToken("garbage", password)).toBe(false);
    // A token signed with a different password must not verify — otherwise
    // rotating the password would not revoke anything.
    expect(verifyOperatorSessionToken(createOperatorSessionToken("other"), password)).toBe(false);
    // An expired token must not verify either.
    const expired = createOperatorSessionToken(password, Date.now() - 24 * 60 * 60 * 1000);
    expect(verifyOperatorSessionToken(expired, password)).toBe(false);
    // And the real thing still works, so the checks above are not vacuous.
    expect(verifyOperatorSessionToken(createOperatorSessionToken(password), password)).toBe(true);
  });
});
