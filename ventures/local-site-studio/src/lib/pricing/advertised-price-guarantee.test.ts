import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  advertisedPriceRefusal,
  bundleCheckoutExpectations,
  commerceSkuExpectation,
  usdToUnitAmount,
  verifyAdvertisedPrices,
  type StripePriceForVerification,
} from "./advertised-price-guarantee";
import { BUNDLES, COMMERCE_ADDON, getBundle } from "./bundles";

/**
 * What the buyer is shown and what the buyer is charged are two different
 * systems joined by an operator pasting a Price ID into an env var.
 *
 * advertised-price-parity.test.ts holds every public surface to bundles.ts, so
 * the shop window cannot drift from the source of truth. It says nothing about
 * Stripe: BUNDLES.setupPriceUsd is 500 and STRIPE_PRICE_ID_STARTER_SETUP is a
 * string, and no code ever asked Stripe what that string costs. A stale id, a
 * test-mode id in live secrets, or an amount edited in the Dashboard bills a
 * figure nobody advertised, and the whole pricing suite stays green.
 *
 * This suite exercises the real module against a fake Stripe rather than
 * stubbing the module — a test that mocks the code under test passes just as
 * happily with the code deleted. The last block is a source scan: it fails if
 * a checkout route is ever added or reverted so that it creates a Session
 * without proving the price first.
 */

const APP_API = path.resolve(__dirname, "..", "..", "app", "api");

function fakeStripe(prices: Record<string, StripePriceForVerification | Error>) {
  const retrieved: string[] = [];
  return {
    retrieved,
    prices: {
      async retrieve(id: string): Promise<StripePriceForVerification> {
        retrieved.push(id);
        const answer = prices[id];
        if (!answer) throw new Error(`No such price: '${id}'`);
        if (answer instanceof Error) throw answer;
        return answer;
      },
    },
  };
}

const oneTime = (id: string, unitAmount: number): StripePriceForVerification => ({
  id,
  unit_amount: unitAmount,
  currency: "usd",
  active: true,
  type: "one_time",
  recurring: null,
});

const monthly = (id: string, unitAmount: number): StripePriceForVerification => ({
  id,
  unit_amount: unitAmount,
  currency: "usd",
  active: true,
  type: "recurring",
  recurring: { interval: "month" },
});

const starter = getBundle("starter")!;
const growth = getBundle("growth")!;

describe("advertised price guarantee", () => {
  it("converts advertised dollars the way bootstrap creates Stripe Prices", () => {
    // bootstrap-stripe-prices.ts uses Math.round(usd * 100); a different
    // rounding here would flag correctly-created Prices as mismatches.
    expect(usdToUnitAmount(500)).toBe(50_000);
    expect(usdToUnitAmount(99)).toBe(9_900);
    expect(usdToUnitAmount(12.34)).toBe(1_234);
  });

  it("passes when every Stripe Price charges the advertised amount", async () => {
    const expectations = bundleCheckoutExpectations({
      bundle: growth,
      setupPriceId: "price_setup",
      monthlyPriceId: "price_monthly",
    });
    const stripe = fakeStripe({
      price_setup: oneTime("price_setup", usdToUnitAmount(growth.setupPriceUsd)),
      price_monthly: monthly("price_monthly", usdToUnitAmount(growth.monthlyPriceUsd!)),
    });

    const result = await verifyAdvertisedPrices(stripe, expectations);

    expect(stripe.retrieved).toEqual(["price_setup", "price_monthly"]);
    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
    expect(advertisedPriceRefusal(result)).toBeNull();
  });

  it("names the tier, the advertised amount and the amount Stripe would charge", async () => {
    // The audited case: a stray Price ID charging $250 for a $500 bundle.
    const expectations = bundleCheckoutExpectations({
      bundle: starter,
      setupPriceId: "price_wrong",
    });
    const stripe = fakeStripe({ price_wrong: oneTime("price_wrong", 25_000) });

    const result = await verifyAdvertisedPrices(stripe, expectations);

    expect(result.ok).toBe(false);
    expect(result.failures).toHaveLength(1);
    const [failure] = result.failures;
    expect(failure!.kind).toBe("mismatch");
    expect(failure!.reason).toContain(`${starter.name} setup`);
    expect(failure!.reason).toContain("$500.00");
    expect(failure!.reason).toContain("$250.00");
    // The operator needs to know which paste to redo.
    expect(failure!.reason).toContain(starter.setupPriceIdEnv);
    expect(failure!.reason).toContain("price_wrong");
  });

  it("reports every wrong line at once, not one per failed checkout", async () => {
    const expectations = bundleCheckoutExpectations({
      bundle: growth,
      setupPriceId: "price_setup",
      monthlyPriceId: "price_monthly",
      commerceAddon: { setupPriceId: "price_addon_setup", monthlyPriceId: "price_addon_monthly" },
    });
    const stripe = fakeStripe({
      price_setup: oneTime("price_setup", 1),
      price_monthly: monthly("price_monthly", 2),
      price_addon_setup: oneTime("price_addon_setup", usdToUnitAmount(COMMERCE_ADDON.setupPriceUsd)),
      price_addon_monthly: monthly("price_addon_monthly", 3),
    });

    const result = await verifyAdvertisedPrices(stripe, expectations);

    expect(stripe.retrieved).toHaveLength(4);
    expect(result.failures.map((failure) => failure.label)).toEqual([
      `${growth.name} setup`,
      `${growth.name} monthly`,
      `${COMMERCE_ADDON.name} monthly`,
    ]);
  });

  it("treats a Stripe error as unproven, never as proven", async () => {
    const expectations = bundleCheckoutExpectations({
      bundle: starter,
      setupPriceId: "price_test_mode",
    });
    const stripe = fakeStripe({
      price_test_mode: new Error("No such price: 'price_test_mode'"),
    });

    const result = await verifyAdvertisedPrices(stripe, expectations);

    expect(result.ok).toBe(false);
    expect(result.failures[0]!.kind).toBe("unverifiable");
    expect(result.failures[0]!.reason).toContain("No such price");
  });

  it("catches a matching amount in the wrong currency", async () => {
    const expectations = bundleCheckoutExpectations({
      bundle: starter,
      setupPriceId: "price_eur",
    });
    const stripe = fakeStripe({
      price_eur: { ...oneTime("price_eur", usdToUnitAmount(starter.setupPriceUsd)), currency: "eur" },
    });

    const result = await verifyAdvertisedPrices(stripe, expectations);
    expect(result.ok).toBe(false);
    expect(result.failures[0]!.reason).toContain("EUR");
  });

  it("catches a matching amount on the wrong billing cadence", async () => {
    const expectations = bundleCheckoutExpectations({
      bundle: growth,
      setupPriceId: "price_setup",
      monthlyPriceId: "price_yearly",
    });
    const stripe = fakeStripe({
      price_setup: oneTime("price_setup", usdToUnitAmount(growth.setupPriceUsd)),
      price_yearly: {
        ...monthly("price_yearly", usdToUnitAmount(growth.monthlyPriceUsd!)),
        recurring: { interval: "year" },
      },
    });

    const result = await verifyAdvertisedPrices(stripe, expectations);
    expect(result.ok).toBe(false);
    expect(result.failures[0]!.reason).toContain("every year");
  });

  it("catches a Price with no fixed amount", async () => {
    const expectations = bundleCheckoutExpectations({
      bundle: starter,
      setupPriceId: "price_metered",
    });
    const stripe = fakeStripe({
      price_metered: { ...oneTime("price_metered", 0), unit_amount: null },
    });

    const result = await verifyAdvertisedPrices(stripe, expectations);
    expect(result.ok).toBe(false);
    expect(result.failures[0]!.reason).toContain("no fixed amount");
  });

  it("catches an archived Price before the buyer meets Stripe's rejection", async () => {
    const expectations = bundleCheckoutExpectations({
      bundle: starter,
      setupPriceId: "price_archived",
    });
    const stripe = fakeStripe({
      price_archived: {
        ...oneTime("price_archived", usdToUnitAmount(starter.setupPriceUsd)),
        active: false,
      },
    });

    const result = await verifyAdvertisedPrices(stripe, expectations);
    expect(result.ok).toBe(false);
    expect(result.failures[0]!.reason).toContain("archived");
  });

  it("refuses a billed line item that no expectation covers", async () => {
    // The guarantee is only as wide as its expectation list. A line item added
    // later without one would be charged unverified and every case above would
    // still pass, so an uncovered id has to be a refusal in its own right.
    const expectations = bundleCheckoutExpectations({
      bundle: starter,
      setupPriceId: "price_setup",
    });
    const stripe = fakeStripe({
      price_setup: oneTime("price_setup", usdToUnitAmount(starter.setupPriceUsd)),
    });

    const result = await verifyAdvertisedPrices(stripe, expectations, [
      "price_setup",
      "price_snuck_in",
    ]);

    expect(result.ok).toBe(false);
    expect(result.failures[0]!.reason).toContain("price_snuck_in");
    expect(result.failures[0]!.reason).toContain("no advertised amount");
  });

  it("builds a Commerce SKU expectation from the cents the preview page prints", async () => {
    const expectation = commerceSkuExpectation({
      id: "sku_latte",
      name: "Latte",
      priceCents: 450,
      stripePriceId: "price_latte",
    });
    expect(expectation).toMatchObject({ unitAmount: 450, currency: "usd", recurringInterval: null });

    const stripe = fakeStripe({ price_latte: oneTime("price_latte", 900) });
    const result = await verifyAdvertisedPrices(stripe, [expectation]);
    expect(result.failures[0]!.reason).toContain("Latte");
    expect(result.failures[0]!.reason).toContain("$4.50");
    expect(result.failures[0]!.reason).toContain("$9.00");
  });

  it("covers every tier the venture sells, not just the one that was tested", () => {
    for (const bundle of BUNDLES) {
      const expectations = bundleCheckoutExpectations({
        bundle,
        setupPriceId: "price_setup",
        monthlyPriceId: bundle.monthlyPriceIdEnv ? "price_monthly" : undefined,
      });
      expect(expectations.map((expectation) => expectation.unitAmount)).toEqual(
        bundle.monthlyPriceUsd == null
          ? [usdToUnitAmount(bundle.setupPriceUsd)]
          : [usdToUnitAmount(bundle.setupPriceUsd), usdToUnitAmount(bundle.monthlyPriceUsd)],
      );
    }
  });
});

describe("the refusal a buyer and an operator get", () => {
  const mismatch = { kind: "mismatch" as const, label: "l", source: "s", priceId: "p", reason: "r" };
  const unverifiable = { ...mismatch, kind: "unverifiable" as const };

  it("is 5xx, because the request was fine and the configuration was not", () => {
    // A 4xx would tell monitoring the buyer did something wrong. They did not.
    expect(advertisedPriceRefusal({ ok: false, checked: [], failures: [mismatch] })!.status).toBe(500);
    expect(
      advertisedPriceRefusal({ ok: false, checked: [], failures: [unverifiable] })!.status,
    ).toBe(502);
  });

  it("separates a contradiction from an unanswered question", () => {
    const contradiction = advertisedPriceRefusal({ ok: false, checked: [], failures: [mismatch] })!;
    const unanswered = advertisedPriceRefusal({ ok: false, checked: [], failures: [unverifiable] })!;
    expect(contradiction.body.error).toBe("Advertised price mismatch");
    expect(unanswered.body.error).toBe("Advertised price unverified");
    // A mismatch anywhere in the batch is the louder finding.
    expect(
      advertisedPriceRefusal({ ok: false, checked: [], failures: [unverifiable, mismatch] })!.body
        .error,
    ).toBe("Advertised price mismatch");
  });

  it("tells the buyer they were not charged", () => {
    for (const failures of [[mismatch], [unverifiable]]) {
      const refusal = advertisedPriceRefusal({ ok: false, checked: [], failures })!;
      expect(refusal.body.message).toMatch(/not been charged/);
    }
  });
});

/**
 * A route that creates a Checkout Session without proving the price first is
 * the defect, whatever the unit tests above say. This reads the routes.
 */
describe("every checkout route proves the price before creating a session", () => {
  function routeFiles(dir: string): string[] {
    const found: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        found.push(...routeFiles(full));
      } else if (entry === "route.ts") {
        found.push(full);
      }
    }
    return found;
  }

  const sessionCreators = routeFiles(APP_API)
    .map((file) => ({ file, source: readFileSync(file, "utf8") }))
    .filter(({ source }) => source.includes("checkout.sessions.create"));

  it("finds the checkout routes at all, so an empty pass cannot look green", () => {
    expect(sessionCreators.map(({ file }) => path.relative(APP_API, file)).sort()).toEqual([
      "commerce/checkout/route.ts",
      "stripe/checkout/route.ts",
    ]);
  });

  it.each(sessionCreators.map(({ file }) => path.relative(APP_API, file)))(
    "%s calls verifyAdvertisedPrices, and calls it first",
    (relative) => {
      const source = sessionCreators.find(({ file }) => file.endsWith(relative))!.source;
      const verifiedAt = source.indexOf("await verifyAdvertisedPrices(");
      const createdAt = source.indexOf("stripe.checkout.sessions.create");

      expect(verifiedAt, `${relative} creates a Checkout Session without verifying the price`).toBeGreaterThan(-1);
      expect(createdAt).toBeGreaterThan(-1);
      expect(verifiedAt, `${relative} verifies the price after the session already exists`).toBeLessThan(createdAt);
      // A verification whose result is dropped is not a guarantee.
      expect(source).toContain("advertisedPriceRefusal(");
    },
  );
});
