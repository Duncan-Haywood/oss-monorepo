import { BUNDLES, COMMERCE_ADDON } from "./bundles";
import { listAllPages } from "../stripe/list-all-pages";

/**
 * Creates Stripe Product + Price objects for every bundle component and returns
 * the env var map operators should paste into .env.local / hosting secrets.
 *
 * Idempotent-ish: looks up existing products by metadata.local_site_studio_key
 * before creating, so re-runs don't duplicate products (new Prices are still
 * created only when missing for that product).
 *
 * The Stripe client is passed in behind a minimal structural interface (not
 * `import Stripe from "stripe"` types) so this stays unit testable with a
 * fake client — mirrors src/lib/commerce/stripe-sync.ts, see
 * bootstrap-stripe-prices.test.ts. The real `new Stripe(secretKey)` client
 * from the SDK satisfies this interface structurally; only the route handler
 * (src/app/api/stripe/bootstrap-prices/route.ts) constructs it and gates on
 * ALLOW_STRIPE_BOOTSTRAP + STRIPE_SECRET_KEY.
 */

export type BootstrapPriceResult = {
  envVar: string;
  priceId: string;
  productId: string;
  created: boolean;
};

/**
 * Stable Stripe Idempotency-Key for a price spec's product.create call —
 * mirrors stripe-connect.ts's connectAccountIdempotencyKey /
 * stripe-sync.ts's commerceProductIdempotencyKey pattern.
 * findProductByKey (list-then-create) is a check-then-act race: an operator
 * double-clicking the bootstrap button, two open dashboard tabs, or a
 * client-retried POST /api/stripe/bootstrap-prices request can all race past
 * the metadata-based list lookup before either create() lands, minting two
 * permanently-orphaned Products under the identical "stable" metadata key —
 * the lookup alone cannot prevent this, since neither concurrent call can see
 * the other's write until it commits. Passing this key as the request's
 * Idempotency-Key closes the race at the Stripe API layer.
 */
function bootstrapProductIdempotencyKey(key: string): string {
  return `local_site_studio_${key}_product`;
}

/**
 * Stable Stripe Idempotency-Key for a price spec's price.create call — same
 * race as bootstrapProductIdempotencyKey, on the Price axis. Includes
 * unitAmount so a legitimate later price change (a new, distinct Price
 * object, since Stripe Prices are immutable) still gets its own key rather
 * than colliding with an earlier amount's create call.
 */
function bootstrapPriceIdempotencyKey(key: string, unitAmount: number): string {
  return `local_site_studio_${key}_price_${unitAmount}`;
}

type MinimalStripeProduct = { id: string; metadata?: Record<string, string> };
type MinimalStripePrice = {
  id: string;
  unit_amount: number | null;
  type?: "one_time" | "recurring";
  recurring?: { interval?: string } | null;
};

/** Interface subset this module calls — matches the real Stripe SDK shape. */
export interface StripeProductsAndPricesForBootstrap {
  products: {
    list(params: {
      limit: number;
      active: boolean;
      starting_after?: string;
    }): Promise<{ data: MinimalStripeProduct[]; has_more: boolean }>;
    create(
      params: {
        name: string;
        metadata: Record<string, string>;
      },
      options?: { idempotencyKey?: string },
    ): Promise<MinimalStripeProduct>;
  };
  prices: {
    list(params: {
      product: string;
      active: boolean;
      limit: number;
      starting_after?: string;
    }): Promise<{ data: MinimalStripePrice[]; has_more: boolean }>;
    create(
      params: {
        product: string;
        currency: string;
        unit_amount: number;
        recurring?: { interval: "month" | "year" };
        metadata: Record<string, string>;
      },
      options?: { idempotencyKey?: string },
    ): Promise<MinimalStripePrice>;
  };
}

/** null for a one-time Price (setup fees); "month" or "year" for a recurring one. */
type PriceSpecInterval = "month" | "year" | null;

type PriceSpec = {
  envVar: string;
  key: string;
  productName: string;
  unitAmountUsd: number;
  interval: PriceSpecInterval;
};

function allPriceSpecs(): PriceSpec[] {
  const specs: PriceSpec[] = [];
  for (const bundle of BUNDLES) {
    specs.push({
      envVar: bundle.setupPriceIdEnv,
      key: `${bundle.id}_setup`,
      productName: `${bundle.name} — setup`,
      unitAmountUsd: bundle.setupPriceUsd,
      interval: null,
    });
    // Monthly and annual share ONE Product (key: `${bundle.id}_recurring`) —
    // Stripe Prices are the immutable per-interval unit, and one Product
    // naturally carries both a monthly and an annual recurring Price for the
    // same plan (annual-billing-option). findMatchingPrice below still tells
    // the two apart by (unitAmount, interval), so this never conflates them.
    if (bundle.monthlyPriceIdEnv && bundle.monthlyPriceUsd != null) {
      specs.push({
        envVar: bundle.monthlyPriceIdEnv,
        key: `${bundle.id}_recurring`,
        productName: `${bundle.name} — recurring`,
        unitAmountUsd: bundle.monthlyPriceUsd,
        interval: "month",
      });
    }
    if (bundle.annualPriceIdEnv && bundle.annualPriceUsd != null) {
      specs.push({
        envVar: bundle.annualPriceIdEnv,
        key: `${bundle.id}_recurring`,
        productName: `${bundle.name} — recurring`,
        unitAmountUsd: bundle.annualPriceUsd,
        interval: "year",
      });
    }
  }
  specs.push(
    {
      envVar: COMMERCE_ADDON.setupPriceIdEnv,
      key: "commerce_setup",
      productName: `${COMMERCE_ADDON.name} — setup`,
      unitAmountUsd: COMMERCE_ADDON.setupPriceUsd,
      interval: null,
    },
    {
      envVar: COMMERCE_ADDON.monthlyPriceIdEnv,
      key: "commerce_monthly",
      productName: `${COMMERCE_ADDON.name} — monthly`,
      unitAmountUsd: COMMERCE_ADDON.monthlyPriceUsd,
      interval: "month",
    },
  );
  return specs;
}

async function findProductByKey(
  stripe: StripeProductsAndPricesForBootstrap,
  key: string,
): Promise<MinimalStripeProduct | null> {
  const matchesKey = (product: MinimalStripeProduct) =>
    product.metadata?.local_site_studio_key === key;
  const listed = await listAllPages(
    (starting_after) => stripe.products.list({ limit: 100, active: true, starting_after }),
    matchesKey,
  );
  return listed.find(matchesKey) ?? null;
}

async function findMatchingPrice(
  stripe: StripeProductsAndPricesForBootstrap,
  productId: string,
  unitAmount: number,
  interval: PriceSpecInterval,
): Promise<MinimalStripePrice | null> {
  const matches = (price: MinimalStripePrice) => {
    const amountMatches = price.unit_amount === unitAmount;
    const intervalMatches = interval
      ? price.recurring?.interval === interval
      : price.type === "one_time";
    return amountMatches && intervalMatches;
  };
  const listed = await listAllPages(
    (starting_after) =>
      stripe.prices.list({ product: productId, active: true, limit: 100, starting_after }),
    matches,
  );
  return listed.find(matches) ?? null;
}

export async function bootstrapStripePrices(
  stripe: StripeProductsAndPricesForBootstrap,
): Promise<{ results: BootstrapPriceResult[]; envSnippet: string }> {
  const results: BootstrapPriceResult[] = [];

  for (const spec of allPriceSpecs()) {
    let product = await findProductByKey(stripe, spec.key);
    let created = false;

    if (!product) {
      product = await stripe.products.create(
        {
          name: spec.productName,
          metadata: { local_site_studio_key: spec.key },
        },
        { idempotencyKey: bootstrapProductIdempotencyKey(spec.key) },
      );
      created = true;
    }

    const unitAmount = Math.round(spec.unitAmountUsd * 100);
    let price = await findMatchingPrice(stripe, product.id, unitAmount, spec.interval);
    if (!price) {
      price = await stripe.prices.create(
        {
          product: product.id,
          currency: "usd",
          unit_amount: unitAmount,
          ...(spec.interval ? { recurring: { interval: spec.interval } } : {}),
          metadata: { local_site_studio_key: spec.key },
        },
        { idempotencyKey: bootstrapPriceIdempotencyKey(spec.key, unitAmount) },
      );
      created = true;
    }

    results.push({
      envVar: spec.envVar,
      priceId: price.id,
      productId: product.id,
      created,
    });
  }

  const envSnippet = results.map((row) => `${row.envVar}=${row.priceId}`).join("\n");
  return { results, envSnippet };
}
