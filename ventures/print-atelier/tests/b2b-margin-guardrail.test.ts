import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  calculateB2BQuote,
  describeMarginGuardrail,
  MIN_PLATFORM_NET_MARGIN_PCT,
} from "../src/lib/b2b-trade.ts";

/**
 * The trade portal's guardrail shield has to be able to go red.
 *
 * `marginSafe` was computed in `calculateB2BQuote`, asserted in
 * `tests/b2b-trade.test.ts`, returned in the result — and read by no UI.
 * `src/app/b2b-portal/page.tsx` rendered "Verified: Artist 30% net profit
 * promise and platform unit economics clear all profit guardrails" in green,
 * unconditionally, to any anonymous visitor (this venture has no middleware).
 *
 * A green badge that cannot go red is not a check. These tests cover both
 * halves of the repair: the decision is a function with two branches, and the
 * page renders that function rather than a sentence.
 */

const VENTURE_ROOT = path.resolve(__dirname, "..");
const PORTAL = path.join(VENTURE_ROOT, "src", "app", "b2b-portal", "page.tsx");

/** A quote whose POD cost is near half of retail — the realistic canvas case. */
function unsafeQuote() {
  return calculateB2BQuote({
    annualSpendToDate: 50000,
    items: [{ sku: "PRINT-001", title: "Midnight Coast", retailPrice: 180, podCost: 95, quantity: 40 }],
  });
}

/** The seeded catalog's ratio — POD cost around a third of retail. */
function safeQuote() {
  return calculateB2BQuote({
    annualSpendToDate: 12500,
    items: [{ sku: "PRINT-001", title: "Midnight Coast", retailPrice: 85, podCost: 28, quantity: 4 }],
  });
}

test("the margin floor holds at 15%", () => {
  // The floor is the whole guardrail: everything below reduces to "is the
  // margin above this number". `scripts/ci/cap_ratchet.py` does NOT cover it —
  // its WATCHES entries are python-constant or yaml-path, and a TypeScript
  // `MIN_` in ventures/ is outside every one of them, despite the prefix that
  // control keys on. So the pin lives here: lowering the floor means editing
  // this line in the same change, and saying why.
  assert.equal(MIN_PLATFORM_NET_MARGIN_PCT, 15);
});

test("a realistic POD cost drives a trade quote under the margin floor", () => {
  // If this stops being reachable the guardrail has no failing case left and
  // the branch below is decoration, so it is asserted rather than assumed.
  const quote = unsafeQuote();
  assert.equal(quote.marginSafe, false);
  assert.ok(
    quote.platformNetMarginPct < MIN_PLATFORM_NET_MARGIN_PCT,
    `expected margin under the ${MIN_PLATFORM_NET_MARGIN_PCT}% floor, got ${quote.platformNetMarginPct}%`,
  );
});

test("the guardrail description refuses a quote under the floor", () => {
  const guardrail = describeMarginGuardrail(unsafeQuote());

  assert.equal(guardrail.safe, false);
  // The wording must not read as an endorsement — this is the text a designer
  // sees immediately above the order button.
  assert.doesNotMatch(guardrail.headline, /\bverified\b/i);
  assert.doesNotMatch(guardrail.detail, /\bclear all profit guardrails\b/i);
  // And it must say what is wrong, in the designer's terms.
  assert.match(guardrail.detail, /below|under/i);
  assert.match(guardrail.detail, new RegExp(`${MIN_PLATFORM_NET_MARGIN_PCT}%`));
  assert.match(guardrail.detail, /artist/i);
});

test("the guardrail description passes a quote that clears the floor", () => {
  const quote = safeQuote();
  assert.equal(quote.marginSafe, true);

  const guardrail = describeMarginGuardrail(quote);
  assert.equal(guardrail.safe, true);
  assert.match(guardrail.detail, new RegExp(`${quote.platformNetMarginPct}%`));
  // Still not "Verified" — this is arithmetic on one quote, not an audit of the
  // payout promise, and the copy has to say which.
  assert.doesNotMatch(guardrail.headline, /\bverified\b/i);
});

test("the two branches do not render the same sentence", () => {
  // Guards the shape of the repair: a `describeMarginGuardrail` that returned a
  // constant would satisfy every assertion above except this one.
  const safe = describeMarginGuardrail(safeQuote());
  const unsafe = describeMarginGuardrail(unsafeQuote());

  assert.notEqual(safe.safe, unsafe.safe);
  assert.notEqual(safe.headline, unsafe.headline);
  assert.notEqual(safe.detail, unsafe.detail);
});

test("the trade portal renders the guardrail instead of a fixed claim", () => {
  // The function having two branches proves nothing if the page still prints a
  // sentence. This is a source contract for that reason: mocking or importing
  // the page would not show which of the two the JSX actually renders.
  const source = readFileSync(PORTAL, "utf8");

  assert.match(
    source,
    /describeMarginGuardrail/,
    "b2b-portal must derive its guardrail badge from describeMarginGuardrail",
  );
  assert.match(source, /guardrail\.safe/, "the badge must branch on the guardrail result");
  assert.match(source, /guardrail\.detail/, "the badge must render the guardrail's own wording");

  assert.doesNotMatch(
    source,
    /clear all profit guardrails/i,
    "the unconditional 'clears all profit guardrails' claim is back in the portal source",
  );
  assert.doesNotMatch(
    source,
    /Verified:\s*Artist/i,
    "the unconditional 'Verified:' shield is back in the portal source",
  );
});
