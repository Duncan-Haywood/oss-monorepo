import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Every HTTP handler under `src/app/api` is operator-guarded unless this file
 * says why it is not.
 *
 * The venture has no login, so `requireOperator` is the only thing standing
 * between an anonymous caller and routes that write live ad catalogs, read
 * order records and report which credentials are configured. Three of the seven
 * routes shipped without it — not because anyone decided they were public, but
 * because adding a route does not prompt anyone to decide. This test makes the
 * decision mandatory: a new handler fails until it is either guarded or listed
 * below with a reason.
 *
 * What this checks is that the call is present in the handler, not that it runs
 * first. `operator-route-authorization.test.ts` checks the behaviour — that an
 * unauthenticated request is actually refused — for the routes it covers.
 */

const API_ROOT = join(process.cwd(), "src/app/api");

/**
 * Handlers that answer unauthenticated callers by design. Each entry names the
 * control that stands in for the operator token; "it is public" is not a
 * reason on its own.
 */
const PUBLIC_BY_DESIGN: Record<string, string> = {
  "storefront/localization GET":
    "Customer-facing localization widget state. Detects visitor country/currency and returns VAT-inclusive or tax-exclusive price formatting disclaimers without modifying server state.",
  "stripe/checkout POST":
    "Customer-facing checkout. The cart is parsed with a rejecting parser and prices come from the server catalog, never the request.",
  "stripe/checkout PUT":
    "Customer-facing cart validation preview. The cart payload is parsed with a rejecting parser and echoes validated line items without server state mutation.",
  "stripe/webhook POST":
    "Called by Stripe, not by a person. Authenticated by `verifyStripeWebhookSignature` against STRIPE_WEBHOOK_SECRET, which is the stronger control here — an operator token would have to be shared with Stripe.",
};

/** Every `route.ts` under src/app/api, as slash-joined path → source. */
function routeSources(dir = API_ROOT, prefix = ""): Map<string, string> {
  const found = new Map<string, string>();
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const next = prefix ? `${prefix}/${entry.name}` : entry.name;
      for (const [name, source] of Array.from(routeSources(path, next))) {
        found.set(name, source);
      }
    } else if (entry.name === "route.ts" || entry.name === "route.tsx") {
      found.set(prefix, readFileSync(path, "utf8"));
    }
  }
  return found;
}

/**
 * Splits a route module into its exported HTTP handlers, as method → body. The
 * body of the last handler runs to the end of the file, which is fine: what is
 * asked of it is whether a call appears inside it.
 */
function handlers(source: string): Map<string, string> {
  const found = new Map<string, string>();
  const pattern = /export async function ([A-Z]+)\s*\(/g;
  const starts = Array.from(source.matchAll(pattern));
  starts.forEach((match, index) => {
    const from = match.index ?? 0;
    const to = index + 1 < starts.length ? (starts[index + 1].index ?? source.length) : source.length;
    found.set(match[1], source.slice(from, to));
  });
  return found;
}

test("every API handler is operator-guarded or listed as public by design", () => {
  const unguarded: string[] = [];
  for (const [route, source] of Array.from(routeSources())) {
    for (const [method, body] of Array.from(handlers(source))) {
      const name = `${route} ${method}`;
      if (name in PUBLIC_BY_DESIGN) {
        continue;
      }
      if (!body.includes("requireOperator(")) {
        unguarded.push(name);
      }
    }
  }
  assert.deepEqual(
    unguarded.sort(),
    [],
    "these handlers answer anonymous callers; add `requireOperator` or list them in PUBLIC_BY_DESIGN with a reason",
  );
});

test("no route is listed as public by design that no longer exists", () => {
  const real = new Set<string>();
  for (const [route, source] of Array.from(routeSources())) {
    for (const method of Array.from(handlers(source).keys())) {
      real.add(`${route} ${method}`);
    }
  }
  const stale = Object.keys(PUBLIC_BY_DESIGN).filter((name) => !real.has(name));
  assert.deepEqual(stale, [], "PUBLIC_BY_DESIGN entries for handlers that no longer exist");
});

test("the exemption list carries a reason for every entry", () => {
  for (const [name, reason] of Object.entries(PUBLIC_BY_DESIGN)) {
    assert.ok(
      reason.trim().length > 40,
      `${name} needs a reason naming the control that replaces the operator token`,
    );
  }
});

test("it finds the routes at all, so an empty pass cannot look like a green one", () => {
  // Without this, moving the api directory would make every check above pass
  // over nothing.
  const routes = routeSources();
  assert.ok(routes.size >= 7, `expected the api routes to be found, saw ${routes.size}`);
  const totalHandlers = Array.from(routes.values()).reduce(
    (count, source) => count + handlers(source).size,
    0,
  );
  assert.ok(totalHandlers >= 8, `expected handlers to be parsed, saw ${totalHandlers}`);
});

test("the handler parser actually separates handlers", () => {
  // A parser that returned one blob per file would let a single guarded method
  // vouch for an unguarded one beside it. This is the case that would hide.
  const parsed = handlers(
    [
      'import { requireOperator } from "@/lib/api-auth";',
      "export async function GET(request: Request) {",
      "  const denied = requireOperator(request);",
      "  return denied ?? NextResponse.json({});",
      "}",
      "export async function POST() {",
      "  return NextResponse.json({});",
      "}",
    ].join("\n"),
  );
  assert.deepEqual(Array.from(parsed.keys()), ["GET", "POST"]);
  assert.ok(parsed.get("GET")?.includes("requireOperator("));
  assert.ok(!parsed.get("POST")?.includes("requireOperator("));
});

test("the api root the contract reads is the one the app serves", () => {
  assert.equal(relative(process.cwd(), API_ROOT), join("src", "app", "api"));
});
