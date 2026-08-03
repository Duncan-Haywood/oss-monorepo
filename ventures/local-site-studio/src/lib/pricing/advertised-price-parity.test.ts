import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BUNDLES, COMMERCE_ADDON, ENTRY_SETUP_PRICE_USD } from "./bundles";

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

/** Every amount that must come from bundles.ts, as it would be typed in copy. */
function pricePatterns(): { label: string; pattern: RegExp }[] {
  const amounts = new Set<number>([ENTRY_SETUP_PRICE_USD, COMMERCE_ADDON.setupPriceUsd]);
  for (const bundle of BUNDLES) {
    amounts.add(bundle.setupPriceUsd);
    if (bundle.monthlyPriceUsd !== null) amounts.add(bundle.monthlyPriceUsd);
  }
  if (COMMERCE_ADDON.monthlyPriceUsd !== null) amounts.add(COMMERCE_ADDON.monthlyPriceUsd);

  return [...amounts].map((amount) => ({
    label: `$${amount}`,
    // A literal dollar figure in source: "$500", "+$300", "$99/mo".
    pattern: new RegExp(`\\$${amount}\\b`),
  }));
}

/** Strip comments so the explanatory notes naming old literals do not trip the scan. */
function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("advertised prices come from bundles.ts", () => {
  it.each(CUSTOMER_FACING)("%s hardcodes no bundle price", (relative) => {
    const text = withoutComments(source(relative));
    for (const { label, pattern } of pricePatterns()) {
      expect(pattern.test(text), `${relative} hardcodes ${label}`).toBe(false);
    }
  });

  it("the landing page reads BUNDLES rather than restating it", () => {
    const text = source("app/page.tsx");
    expect(text).toContain("@/lib/pricing/bundles");
    expect(text).toMatch(/BUNDLES\.map/);
  });

  it("the entry price is the cheapest tier, not a separately maintained number", () => {
    expect(ENTRY_SETUP_PRICE_USD).toBe(Math.min(...BUNDLES.map((b) => b.setupPriceUsd)));
  });

  it("would catch a price change that only moves checkout", () => {
    // Proves the scan is anchored to bundles.ts and not to today's numbers:
    // a figure that is not a current price is not what the scan looks for.
    const notAPrice = 12345;
    expect(pricePatterns().some((p) => p.label === `$${notAPrice}`)).toBe(false);
    expect(pricePatterns().some((p) => p.label === `$${BUNDLES[0].setupPriceUsd}`)).toBe(true);
  });
});
