import Stripe from "stripe";
import { BUNDLES, COMMERCE_ADDON } from "./bundles";

/**
 * Creates Stripe Product + Price objects for every bundle component and returns
 * the env var map operators should paste into .env.local / hosting secrets.
 *
 * Idempotent-ish: looks up existing products by metadata.local_site_studio_key
 * before creating, so re-runs don't duplicate products (new Prices are still
 * created only when missing for that product).
 */

export type BootstrapPriceResult = {
  envVar: string;
  priceId: string;
  productId: string;
  created: boolean;
};

type PriceSpec = {
  envVar: string;
  key: string;
  productName: string;
  unitAmountUsd: number;
  recurring: boolean;
};

function allPriceSpecs(): PriceSpec[] {
  const specs: PriceSpec[] = [];
  for (const bundle of BUNDLES) {
    specs.push({
      envVar: bundle.setupPriceIdEnv,
      key: `${bundle.id}_setup`,
      productName: `${bundle.name} — setup`,
      unitAmountUsd: bundle.setupPriceUsd,
      recurring: false,
    });
    if (bundle.monthlyPriceIdEnv && bundle.monthlyPriceUsd != null) {
      specs.push({
        envVar: bundle.monthlyPriceIdEnv,
        key: `${bundle.id}_monthly`,
        productName: `${bundle.name} — monthly`,
        unitAmountUsd: bundle.monthlyPriceUsd,
        recurring: true,
      });
    }
  }
  specs.push(
    {
      envVar: COMMERCE_ADDON.setupPriceIdEnv,
      key: "commerce_setup",
      productName: `${COMMERCE_ADDON.name} — setup`,
      unitAmountUsd: COMMERCE_ADDON.setupPriceUsd,
      recurring: false,
    },
    {
      envVar: COMMERCE_ADDON.monthlyPriceIdEnv,
      key: "commerce_monthly",
      productName: `${COMMERCE_ADDON.name} — monthly`,
      unitAmountUsd: COMMERCE_ADDON.monthlyPriceUsd,
      recurring: true,
    },
  );
  return specs;
}

/**
 * Stripe list endpoints cap a single page at 100 items. Bootstrap only creates
 * a fixed handful of platform Products today, but the Stripe account itself
 * can already hold >100 active Products from Commerce catalog syncs (see
 * src/lib/commerce/stripe-sync.ts) — an un-paginated lookup here would miss
 * an existing bootstrap Product/Price past page 1 and create a duplicate.
 */
async function findProductByKey(
  stripe: Stripe,
  key: string,
): Promise<Stripe.Product | null> {
  let startingAfter: string | undefined;
  for (;;) {
    const listed = await stripe.products.list({ limit: 100, active: true, starting_after: startingAfter });
    const match = listed.data.find((product) => product.metadata.local_site_studio_key === key);
    if (match) return match;
    if (!listed.has_more) return null;
    startingAfter = listed.data[listed.data.length - 1]?.id;
  }
}

async function findMatchingPrice(
  stripe: Stripe,
  productId: string,
  unitAmount: number,
  recurring: boolean,
): Promise<Stripe.Price | null> {
  const matches = (price: Stripe.Price) => {
    const amountMatches = price.unit_amount === unitAmount;
    const recurringMatches = recurring
      ? price.recurring?.interval === "month"
      : price.type === "one_time";
    return amountMatches && recurringMatches;
  };
  let startingAfter: string | undefined;
  for (;;) {
    const listed = await stripe.prices.list({
      product: productId,
      active: true,
      limit: 100,
      starting_after: startingAfter,
    });
    const match = listed.data.find(matches);
    if (match) return match;
    if (!listed.has_more) return null;
    startingAfter = listed.data[listed.data.length - 1]?.id;
  }
}

export async function bootstrapStripePrices(
  stripe: Stripe,
): Promise<{ results: BootstrapPriceResult[]; envSnippet: string }> {
  const results: BootstrapPriceResult[] = [];

  for (const spec of allPriceSpecs()) {
    let product = await findProductByKey(stripe, spec.key);
    let created = false;

    if (!product) {
      product = await stripe.products.create({
        name: spec.productName,
        metadata: { local_site_studio_key: spec.key },
      });
      created = true;
    }

    const unitAmount = Math.round(spec.unitAmountUsd * 100);
    let price = await findMatchingPrice(stripe, product.id, unitAmount, spec.recurring);
    if (!price) {
      price = await stripe.prices.create({
        product: product.id,
        currency: "usd",
        unit_amount: unitAmount,
        ...(spec.recurring ? { recurring: { interval: "month" as const } } : {}),
        metadata: { local_site_studio_key: spec.key },
      });
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
