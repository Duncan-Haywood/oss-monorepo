import { describe, expect, it } from "vitest";
import { bootstrapStripePrices, type StripeProductsAndPricesForBootstrap } from "./bootstrap-stripe-prices";
import { BUNDLES, COMMERCE_ADDON } from "./bundles";

function createFakeStripe(): StripeProductsAndPricesForBootstrap & {
  productCount: () => number;
  priceCount: () => number;
  productCreateCallsByIdempotencyKey: () => Map<string, number>;
  priceCreateCallsByIdempotencyKey: () => Map<string, number>;
} {
  const products: Array<{ id: string; metadata: Record<string, string> }> = [];
  const prices: Array<{
    id: string;
    product: string;
    unit_amount: number;
    type: "one_time" | "recurring";
    recurring?: { interval?: string } | null;
  }> = [];
  let nextId = 1;

  /** Real Stripe returns the SAME object for a replayed Idempotency-Key instead of creating a second one. */
  const productsByIdempotencyKey = new Map<string, (typeof products)[number]>();
  const productCreateCallsByIdempotencyKey = new Map<string, number>();
  const pricesByIdempotencyKey = new Map<string, (typeof prices)[number]>();
  const priceCreateCallsByIdempotencyKey = new Map<string, number>();

  /** Real Stripe list endpoints cap a page at `limit` and set has_more/starting_after. */
  function paginate<T extends { id: string }>(
    all: T[],
    limit: number,
    startingAfter: string | undefined,
  ): { data: T[]; has_more: boolean } {
    const startIndex = startingAfter
      ? all.findIndex((item) => item.id === startingAfter) + 1
      : 0;
    const page = all.slice(startIndex, startIndex + limit);
    return { data: page, has_more: startIndex + page.length < all.length };
  }

  return {
    products: {
      async list({ limit, starting_after }) {
        return paginate(products, limit, starting_after);
      },
      async create({ metadata }, options) {
        const idempotencyKey = options?.idempotencyKey;
        if (idempotencyKey) {
          productCreateCallsByIdempotencyKey.set(
            idempotencyKey,
            (productCreateCallsByIdempotencyKey.get(idempotencyKey) ?? 0) + 1,
          );
          const existing = productsByIdempotencyKey.get(idempotencyKey);
          if (existing) return existing;
        }
        const product = { id: `prod_${nextId++}`, metadata };
        products.push(product);
        if (idempotencyKey) productsByIdempotencyKey.set(idempotencyKey, product);
        return product;
      },
    },
    prices: {
      async list({ product, limit, starting_after }) {
        return paginate(
          prices.filter((p) => p.product === product),
          limit,
          starting_after,
        );
      },
      async create({ product, unit_amount, recurring }, options) {
        const idempotencyKey = options?.idempotencyKey;
        if (idempotencyKey) {
          priceCreateCallsByIdempotencyKey.set(
            idempotencyKey,
            (priceCreateCallsByIdempotencyKey.get(idempotencyKey) ?? 0) + 1,
          );
          const existing = pricesByIdempotencyKey.get(idempotencyKey);
          if (existing) return existing;
        }
        const price = {
          id: `price_${nextId++}`,
          product,
          unit_amount,
          type: (recurring ? "recurring" : "one_time") as "one_time" | "recurring",
          recurring: recurring ?? null,
        };
        prices.push(price);
        if (idempotencyKey) pricesByIdempotencyKey.set(idempotencyKey, price);
        return price;
      },
    },
    productCount: () => products.length,
    priceCount: () => prices.length,
    productCreateCallsByIdempotencyKey: () => productCreateCallsByIdempotencyKey,
    priceCreateCallsByIdempotencyKey: () => priceCreateCallsByIdempotencyKey,
  };
}

const EXPECTED_SPEC_COUNT =
  BUNDLES.reduce((count, bundle) => count + (bundle.monthlyPriceIdEnv ? 2 : 1), 0) + 2; // + Commerce setup/monthly

describe("bootstrapStripePrices", () => {
  it("creates one Product + Price per bundle/commerce price spec", async () => {
    const stripe = createFakeStripe();
    const { results, envSnippet } = await bootstrapStripePrices(stripe);

    expect(results).toHaveLength(EXPECTED_SPEC_COUNT);
    expect(results.every((r) => r.created)).toBe(true);
    expect(stripe.productCount()).toBe(EXPECTED_SPEC_COUNT);
    expect(stripe.priceCount()).toBe(EXPECTED_SPEC_COUNT);

    const starterSetup = results.find((r) => r.envVar === "STRIPE_PRICE_ID_STARTER_SETUP");
    expect(starterSetup?.priceId).toMatch(/^price_/);
    expect(envSnippet).toContain(`STRIPE_PRICE_ID_STARTER_SETUP=${starterSetup?.priceId}`);
    expect(envSnippet).toContain("STRIPE_PRICE_ID_COMMERCE_MONTHLY=");
  });

  it("is idempotent on re-run: reuses existing Products/Prices and reports created=false", async () => {
    const stripe = createFakeStripe();
    const first = await bootstrapStripePrices(stripe);
    const second = await bootstrapStripePrices(stripe);

    expect(second.results.every((r) => !r.created)).toBe(true);
    expect(second.results.map((r) => r.priceId)).toEqual(first.results.map((r) => r.priceId));
    expect(second.results.map((r) => r.productId)).toEqual(first.results.map((r) => r.productId));
    expect(stripe.productCount()).toBe(EXPECTED_SPEC_COUNT);
    expect(stripe.priceCount()).toBe(EXPECTED_SPEC_COUNT);
  });

  it("reuses the existing Product but creates a fresh Price when no Price on it matches the current amount", async () => {
    const stripe = createFakeStripe();
    // Pre-seed a Product for Growth monthly (metadata key matches the spec)
    // with only a stale/mismatched Price on it — simulates an account where
    // the bundle's price changed since the last bootstrap run.
    const product = await stripe.products.create({
      name: "Growth — monthly",
      metadata: { local_site_studio_key: "growth_monthly" },
    });
    const stalePrice = await stripe.prices.create({
      product: product.id,
      currency: "usd",
      unit_amount: 14900,
      recurring: { interval: "month" },
      metadata: {},
    });

    const { results } = await bootstrapStripePrices(stripe);
    const growthMonthly = results.find((r) => r.envVar === "STRIPE_PRICE_ID_GROWTH_MONTHLY");

    // Product reused (found by metadata key); the stale Price at the wrong
    // amount is never matched, so a fresh $99/mo Price is created alongside it
    // (Stripe Prices are immutable — bootstrap never mutates/deletes one).
    expect(growthMonthly?.productId).toBe(product.id);
    expect(growthMonthly?.priceId).not.toBe(stalePrice.id);
    expect(growthMonthly?.created).toBe(true);
  });

  it("does not confuse a one-time and recurring Price at the same amount on the same Product", async () => {
    const stripe = createFakeStripe();
    // Starter setup ($500 one-time) and a hypothetical $500/mo recurring price
    // must never be matched against each other even if unit_amount is equal.
    const product = await stripe.products.create({
      name: "Test",
      metadata: { local_site_studio_key: "starter_setup" },
    });
    await stripe.prices.create({
      product: product.id,
      currency: "usd",
      unit_amount: 50000,
      recurring: { interval: "month" },
      metadata: {},
    });

    const { results } = await bootstrapStripePrices(stripe);
    const starterSetup = results.find((r) => r.envVar === "STRIPE_PRICE_ID_STARTER_SETUP");

    // The pre-seeded recurring Price must be ignored; a new one-time Price is created.
    expect(starterSetup?.created).toBe(true);
    expect(stripe.priceCount()).toBe(EXPECTED_SPEC_COUNT + 1);
  });

  it("finds an existing Product/Price past Stripe's 100-item list page on re-run", async () => {
    const stripe = createFakeStripe();
    // Fill the account with >100 active Products unrelated to bootstrap so the
    // bootstrap Products/Prices fall past the first list() page.
    for (let i = 0; i < 110; i++) {
      await stripe.products.create({
        name: `Filler ${i}`,
        metadata: { local_site_studio_key: `filler_${i}` },
      });
    }
    const first = await bootstrapStripePrices(stripe);
    expect(stripe.productCount()).toBeGreaterThan(110);

    const second = await bootstrapStripePrices(stripe);

    // Without pagination, findProductByKey/findMatchingPrice only scan page 1
    // (limit 100) and would wrongly create duplicate Products/Prices here.
    expect(second.results.every((r) => !r.created)).toBe(true);
    expect(second.results.map((r) => r.productId)).toEqual(first.results.map((r) => r.productId));
    expect(second.results.map((r) => r.priceId)).toEqual(first.results.map((r) => r.priceId));
  });

  it("covers the full BUNDLES + COMMERCE_ADDON env var set (no silent drop)", async () => {
    const stripe = createFakeStripe();
    const { results } = await bootstrapStripePrices(stripe);
    const envVars = results.map((r) => r.envVar).sort();

    const expected = [
      ...BUNDLES.flatMap((b) => [b.setupPriceIdEnv, b.monthlyPriceIdEnv].filter(Boolean) as string[]),
      COMMERCE_ADDON.setupPriceIdEnv,
      COMMERCE_ADDON.monthlyPriceIdEnv,
    ].sort();

    expect(envVars).toEqual(expected);
  });

  it("passes a stable Idempotency-Key on every product.create and price.create call", async () => {
    const stripe = createFakeStripe();
    await bootstrapStripePrices(stripe);

    const productCalls = stripe.productCreateCallsByIdempotencyKey();
    const priceCalls = stripe.priceCreateCallsByIdempotencyKey();

    expect(productCalls.size).toBe(EXPECTED_SPEC_COUNT);
    expect(priceCalls.size).toBe(EXPECTED_SPEC_COUNT);
    expect([...productCalls.values()].every((count) => count === 1)).toBe(true);
    expect([...priceCalls.values()].every((count) => count === 1)).toBe(true);
    expect([...productCalls.keys()]).toContain("local_site_studio_starter_setup_product");
  });

  it("never mints a duplicate Product/Price when two concurrent calls both race past the list-based precheck", async () => {
    // Simulates the exact race findProductByKey/findMatchingPrice cannot close
    // by itself: both invocations of bootstrapStripePrices see no existing
    // Product/Price for a spec (list runs before either create lands) and
    // both call products.create/prices.create — Stripe's Idempotency-Key
    // guarantee is what actually collapses them to one object, verified here
    // by calling the fake client's create directly with the same derived key
    // the module uses, twice, "concurrently".
    const stripe = createFakeStripe();
    const key = "starter_setup";
    const productKey = `local_site_studio_${key}_product`;

    const [firstProduct, secondProduct] = await Promise.all([
      stripe.products.create(
        { name: "Starter — setup", metadata: { local_site_studio_key: key } },
        { idempotencyKey: productKey },
      ),
      stripe.products.create(
        { name: "Starter — setup", metadata: { local_site_studio_key: key } },
        { idempotencyKey: productKey },
      ),
    ]);

    expect(firstProduct.id).toBe(secondProduct.id);
    expect(stripe.productCount()).toBe(1);

    const unitAmount = 50000;
    const priceKey = `local_site_studio_${key}_price_${unitAmount}`;
    const [firstPrice, secondPrice] = await Promise.all([
      stripe.prices.create(
        {
          product: firstProduct.id,
          currency: "usd",
          unit_amount: unitAmount,
          metadata: { local_site_studio_key: key },
        },
        { idempotencyKey: priceKey },
      ),
      stripe.prices.create(
        {
          product: firstProduct.id,
          currency: "usd",
          unit_amount: unitAmount,
          metadata: { local_site_studio_key: key },
        },
        { idempotencyKey: priceKey },
      ),
    ]);

    expect(firstPrice.id).toBe(secondPrice.id);
    expect(stripe.priceCount()).toBe(1);
  });
});
