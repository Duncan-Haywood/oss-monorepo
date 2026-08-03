import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BUNDLES, ENTRY_SETUP_PRICE_USD } from "./bundles";

/**
 * No customer-facing page may hardcode a price.
 *
 * bundles.ts calls itself the single source of truth, and checkout, the preview
 * upsell and the Stripe bootstrap all read from it — but the landing page,
 * page metadata and terms carried their own "$500" / "$99/mo" / "+$300" /
 * "$49/mo" literals. Changing a price in bundles.ts moved the charge and left
 * the shop window advertising the old number: the customer clicks "from $99/mo"
 * and lands on a different figure at checkout.
 *
 * A source scan rather than a render: this must fail when someone types a
 * literal back in, not only when the rendered output happens to disagree today.
 * (It does not address the separate gap that no code compares setupPriceUsd to
 * the unit_amount of the Stripe Price the STRIPE_PRICE_ID_* env var points at —
 * the displayed number and the charged number are still only linked by an
 * operator pasting the right id.)
 */

const SRC = join(__dirname, "..", "..");

/** Pages a prospective customer reads before deciding to buy. */
const CUSTOMER_FACING = [
  "app/page.tsx",
  "app/layout.tsx",
  "app/terms/page.tsx",
  "app/checkout/checkout-form.tsx",
  "components/preview/tier-upsell.tsx",
];

function source(relative: string): string {
  return readFileSync(join(SRC, relative), "utf8");
}

/**
 * Any literal dollar figure — "$500", "+$300", "$99/mo".
 *
 * Deliberately not a list of the current prices. Scanning only for today's
 * numbers misses the drift this exists to catch: raise growth to $129 and a
 * stale "$99/mo" left in the copy is no longer a current price, so a
 * current-prices scan would call the file clean while the page advertises a
 * figure the customer will not be charged. `${...}` interpolation does not
 * match, so derived values pass.
 */
const HARDCODED_DOLLAR_FIGURE = /\$[0-9]/;

/** Strip comments so the explanatory notes naming old literals do not trip the scan. */
function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("advertised prices come from bundles.ts", () => {
  it.each(CUSTOMER_FACING)("%s hardcodes no dollar figure", (relative) => {
    const text = withoutComments(source(relative));
    const offending = text
      .split("\n")
      .map((line, index) => ({ line: line.trim(), number: index + 1 }))
      .filter(({ line }) => HARDCODED_DOLLAR_FIGURE.test(line));

    expect(
      offending,
      `${relative} hardcodes a price — derive it from BUNDLES / COMMERCE_ADDON:\n` +
        offending.map((o) => `  ${relative}:${o.number}  ${o.line}`).join("\n"),
    ).toEqual([]);
  });

  it("the landing page reads BUNDLES rather than restating it", () => {
    const text = source("app/page.tsx");
    expect(text).toContain("@/lib/pricing/bundles");
    expect(text).toMatch(/BUNDLES\.map/);
  });

  it("the entry price is the cheapest tier, not a separately maintained number", () => {
    expect(ENTRY_SETUP_PRICE_USD).toBe(Math.min(...BUNDLES.map((b) => b.setupPriceUsd)));
  });

  it("catches a stale figure for a price that has since changed", () => {
    // The drift case a current-prices scan would miss: $99/mo left behind after
    // growth moved to $129. Both must read as violations.
    const staleAfterAPriceRise = 'recurring: "$99/mo",';
    const currentPrice = `setup: "$${BUNDLES[0].setupPriceUsd}",`;
    expect(HARDCODED_DOLLAR_FIGURE.test(staleAfterAPriceRise)).toBe(true);
    expect(HARDCODED_DOLLAR_FIGURE.test(currentPrice)).toBe(true);
  });

  it("does not flag a derived value", () => {
    expect(HARDCODED_DOLLAR_FIGURE.test("{usd(pricing.setupPriceUsd)}")).toBe(false);
    expect(HARDCODED_DOLLAR_FIGURE.test("pay $${ENTRY_SETUP_PRICE_USD}, go live")).toBe(false);
  });
});
