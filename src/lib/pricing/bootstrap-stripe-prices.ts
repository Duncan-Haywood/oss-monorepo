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

async function findProductByKey(
  stripe: Stripe,
  key: string,
): Promise<Stripe.Product | null> {
  const listed = await stripe.products.list({ limit: 100, active: true });
  return listed.data.find((product) => product.metadata.local_site_studio_key === key) ?? null;
}

async function findMatchingPrice(
  stripe: Stripe,
  productId: string,
  unitAmount: number,
  recurring: boolean,
): Promise<Stripe.Price | null> {
  const listed = await stripe.prices.list({ product: productId, active: true, limit: 100 });
  return (
    listed.data.find((price) => {
      const amountMatches = price.unit_amount === unitAmount;
      const recurringMatches = recurring
        ? price.recurring?.interval === "month"
        : price.type === "one_time";
      return amountMatches && recurringMatches;
    }) ?? null
  );
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
