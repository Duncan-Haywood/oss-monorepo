import { COMMERCE_ADDON, type BundleDefinition } from "./bundles";

/**
 * Proves, against Stripe, that a checkout will charge the amount the page
 * advertised — before the Checkout Session exists.
 *
 * bundles.ts is the single source of truth for the *displayed* number, and
 * advertised-price-parity.test.ts keeps every customer-facing surface reading
 * it. Neither says anything about the *charged* number: the tier's Price ID
 * arrives from a STRIPE_PRICE_ID_* env var an operator pasted, and nothing in
 * the codebase ever asked Stripe what that Price actually costs. A stale id, a
 * test-mode id pasted into live secrets, or an amount edited in the Stripe
 * Dashboard silently charges a different figure than the one the buyer read,
 * with every pricing test green. That is a revenue defect and a false-
 * advertising one.
 *
 * So the check has to talk to Stripe, and it has to run on the create path
 * rather than in a readiness helper — assessBundlePriceEnvReadiness already
 * shows an operator whether the env vars are *set*, which is exactly the
 * question that misses this.
 *
 * Fail closed, both ways. A mismatch refuses the sale; it never charges the
 * Stripe amount (the buyer did not agree to it) and never rewrites the line
 * item to the advertised amount (that would sell at a price no Stripe Price
 * object records, and hide the misconfiguration from the operator forever).
 * A Stripe error refuses too: "we could not confirm the price" is not
 * "the price is right".
 *
 * Deliberately uncached. A cache would reintroduce a window in which the
 * advertised and charged amounts disagree and checkout does not notice, which
 * is the whole defect; one extra Stripe read per checkout is cheap next to the
 * session create that follows it.
 *
 * The Stripe client is taken behind a minimal structural interface rather than
 * the SDK types, mirroring bootstrap-stripe-prices.ts, so the collect/assert
 * logic is unit testable against a fake and the route can hand it the real
 * `new Stripe(secretKey)` client unchanged.
 */

/** Subset of a Stripe Price this module reads — matches the real SDK shape. */
export type StripePriceForVerification = {
  id: string;
  unit_amount: number | null;
  currency: string;
  active?: boolean;
  type?: "one_time" | "recurring";
  recurring?: { interval?: string } | null;
};

/** Interface subset this module calls on the Stripe client. */
export interface StripePricesForVerification {
  prices: {
    retrieve(id: string): Promise<StripePriceForVerification>;
  };
}

/**
 * One thing the buyer was quoted, paired with the Price ID that will bill it.
 *
 * Call sites build this next to the line item they push, so the id verified
 * here is by construction the id charged — not a second lookup that could
 * resolve differently.
 */
export type AdvertisedPriceExpectation = {
  /** What the buyer saw this line called, e.g. "Growth monthly". */
  label: string;
  /** Where the Price ID came from — the env var or field an operator fixes. */
  source: string;
  priceId: string;
  /** Advertised amount in the smallest currency unit (USD cents). */
  unitAmount: number;
  /** Lowercase ISO currency the amount was advertised in. */
  currency: string;
  /** "month" for advertised /mo figures, null for one-time fees. */
  recurringInterval: "month" | null;
};

export type AdvertisedPriceFailure = {
  /**
   * `mismatch` — Stripe answered, and the answer contradicts the advertised
   * offer. `unverifiable` — Stripe did not answer, so the offer is unproven.
   * Different operator response, so they stay distinguishable here rather than
   * collapsing into one "price check failed".
   */
  kind: "mismatch" | "unverifiable";
  label: string;
  source: string;
  priceId: string;
  /** Operator-facing sentence naming the line, the advertised figure and the charge. */
  reason: string;
};

export type AdvertisedPriceVerification = {
  ok: boolean;
  /** Every expectation checked, in the order given — what this collected. */
  checked: readonly AdvertisedPriceExpectation[];
  /** Empty when ok. */
  failures: readonly AdvertisedPriceFailure[];
};

/** Advertised USD dollars → Stripe's smallest-unit integer, as bootstrap creates them. */
export function usdToUnitAmount(amountUsd: number): number {
  return Math.round(amountUsd * 100);
}

function formatUnitAmount(unitAmount: number | null, currency: string): string {
  if (unitAmount == null) return "no fixed amount";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(unitAmount / 100);
  } catch {
    // An unknown currency code must not turn a price mismatch into a crash.
    return `${(unitAmount / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

function cadence(interval: "month" | null): string {
  return interval ? `every ${interval}` : "one time";
}

function priceCadence(price: StripePriceForVerification): string {
  const interval = price.recurring?.interval;
  if (interval) return `every ${interval}`;
  return "one time";
}

/**
 * The expectations for a bundle checkout, given the Price IDs already resolved
 * from env by the caller.
 *
 * Takes the ids rather than reading process.env so it cannot verify a
 * different id than the one the route put in the line items — the route
 * resolves each env var once, and hands the same string to both.
 */
export function bundleCheckoutExpectations(args: {
  bundle: BundleDefinition;
  setupPriceId: string;
  monthlyPriceId?: string;
  commerceAddon?: { setupPriceId: string; monthlyPriceId: string };
}): AdvertisedPriceExpectation[] {
  const { bundle } = args;
  const expectations: AdvertisedPriceExpectation[] = [
    {
      label: `${bundle.name} setup`,
      source: bundle.setupPriceIdEnv,
      priceId: args.setupPriceId,
      unitAmount: usdToUnitAmount(bundle.setupPriceUsd),
      currency: "usd",
      recurringInterval: null,
    },
  ];

  if (args.monthlyPriceId && bundle.monthlyPriceIdEnv && bundle.monthlyPriceUsd != null) {
    expectations.push({
      label: `${bundle.name} monthly`,
      source: bundle.monthlyPriceIdEnv,
      priceId: args.monthlyPriceId,
      unitAmount: usdToUnitAmount(bundle.monthlyPriceUsd),
      currency: "usd",
      recurringInterval: "month",
    });
  }

  if (args.commerceAddon) {
    expectations.push(
      {
        label: `${COMMERCE_ADDON.name} setup`,
        source: COMMERCE_ADDON.setupPriceIdEnv,
        priceId: args.commerceAddon.setupPriceId,
        unitAmount: usdToUnitAmount(COMMERCE_ADDON.setupPriceUsd),
        currency: "usd",
        recurringInterval: null,
      },
      {
        label: `${COMMERCE_ADDON.name} monthly`,
        source: COMMERCE_ADDON.monthlyPriceIdEnv,
        priceId: args.commerceAddon.monthlyPriceId,
        unitAmount: usdToUnitAmount(COMMERCE_ADDON.monthlyPriceUsd),
        currency: "usd",
        recurringInterval: "month",
      },
    );
  }

  return expectations;
}

/**
 * The expectation for one synced Commerce SKU.
 *
 * The preview page prints priceCents through formatPriceUsd; that is the
 * advertised figure, and stripePriceId is what bills. mergeStripeIdsIntoCatalog
 * drops a stale stripePriceId when priceCents changes locally, but nothing
 * covers an amount edited on the Stripe side, so the same proof applies.
 */
export function commerceSkuExpectation(sku: {
  id: string;
  name: string;
  priceCents: number;
  stripePriceId: string;
}): AdvertisedPriceExpectation {
  return {
    label: sku.name,
    source: `catalog SKU ${sku.id}`,
    priceId: sku.stripePriceId,
    unitAmount: sku.priceCents,
    currency: "usd",
    recurringInterval: null,
  };
}

function mismatchReason(
  expectation: AdvertisedPriceExpectation,
  price: StripePriceForVerification,
): string | null {
  const advertised = formatUnitAmount(expectation.unitAmount, expectation.currency);

  if (price.unit_amount !== expectation.unitAmount) {
    return (
      `${expectation.label} is advertised at ${advertised} but Stripe Price ${price.id} ` +
      `would charge ${formatUnitAmount(price.unit_amount, price.currency)}`
    );
  }
  if (price.currency?.toLowerCase() !== expectation.currency) {
    return (
      `${expectation.label} is advertised in ${expectation.currency.toUpperCase()} but ` +
      `Stripe Price ${price.id} charges in ${String(price.currency).toUpperCase()}`
    );
  }
  if (priceCadence(price) !== cadence(expectation.recurringInterval)) {
    return (
      `${expectation.label} is advertised as ${advertised} ${cadence(expectation.recurringInterval)} ` +
      `but Stripe Price ${price.id} bills ${priceCadence(price)}`
    );
  }
  if (price.active === false) {
    return (
      `${expectation.label} points at archived Stripe Price ${price.id} — ` +
      `Stripe will reject the sale rather than charge ${advertised}`
    );
  }
  return null;
}

/**
 * Retrieve every expected Price from Stripe, then judge them.
 *
 * Collects all failures before returning rather than throwing on the first, so
 * an operator fixing a mispasted env var sees every wrong line at once instead
 * of one per failed checkout attempt.
 */
export async function verifyAdvertisedPrices(
  stripe: StripePricesForVerification,
  expectations: readonly AdvertisedPriceExpectation[],
  /**
   * Every Price ID the session would actually bill, if the caller has one.
   *
   * The guarantee is only as wide as its expectation list. A line item added
   * later without a matching expectation would be charged unverified and every
   * test here would still pass, so callers hand over what they are about to
   * bill and an uncovered id is refused like any other unproven price.
   */
  billedPriceIds?: readonly (string | undefined)[],
): Promise<AdvertisedPriceVerification> {
  const failures: AdvertisedPriceFailure[] = [];

  if (billedPriceIds) {
    const expected = new Set(expectations.map((expectation) => expectation.priceId));
    for (const priceId of billedPriceIds) {
      if (priceId && expected.has(priceId)) continue;
      failures.push({
        kind: "unverifiable",
        label: "unnamed line item",
        source: "checkout line items",
        priceId: priceId ?? "",
        reason:
          `Checkout would bill Stripe Price ${priceId ?? "(none)"} with no advertised amount ` +
          `to check it against — refusing rather than charging an unadvertised price`,
      });
    }
  }

  for (const expectation of expectations) {
    let price: StripePriceForVerification;
    try {
      price = await stripe.prices.retrieve(expectation.priceId);
    } catch (error) {
      // Includes the stray-test-mode-id case: a live key retrieving a test
      // Price ID gets "No such price", which must block the sale, not pass it.
      const detail = error instanceof Error ? error.message : "Unknown Stripe error";
      failures.push({
        kind: "unverifiable",
        label: expectation.label,
        source: expectation.source,
        priceId: expectation.priceId,
        reason:
          `Could not confirm what Stripe Price ${expectation.priceId} (${expectation.source}) ` +
          `charges for ${expectation.label}: ${detail}`,
      });
      continue;
    }

    const reason = mismatchReason(expectation, price);
    if (reason) {
      failures.push({
        kind: "mismatch",
        label: expectation.label,
        source: expectation.source,
        priceId: expectation.priceId,
        reason: `${reason} (${expectation.source})`,
      });
    }
  }

  return { ok: failures.length === 0, checked: expectations, failures };
}

export type AdvertisedPriceRefusal = {
  status: number;
  body: { error: string; message: string; reasons: string[] };
};

/**
 * The response a route owes a buyer whose checkout was refused, plus the
 * detail an operator needs to fix it.
 *
 * 5xx on purpose, and split: the request was well formed and the buyer did
 * nothing wrong, so a 4xx would tell monitoring this is the customer's
 * problem. 500 for a mismatch — our configuration contradicts our own shop
 * window. 502 for unverifiable — Stripe did not answer.
 *
 * The reasons carry Price IDs and env var names. Neither is a secret (a Price
 * ID is visible in any Checkout integration), and without them the refusal
 * tells an operator only that something is wrong, not which paste to redo.
 */
export function advertisedPriceRefusal(
  verification: AdvertisedPriceVerification,
): AdvertisedPriceRefusal | null {
  if (verification.ok) return null;

  const reasons = verification.failures.map((failure) => failure.reason);
  const mismatched = verification.failures.some((failure) => failure.kind === "mismatch");

  return mismatched
    ? {
        status: 500,
        body: {
          error: "Advertised price mismatch",
          message:
            "This checkout was stopped because the price we would charge does not match the " +
            "price shown on the page. You have not been charged. Please contact us — we will " +
            "honour the advertised price.",
          reasons,
        },
      }
    : {
        status: 502,
        body: {
          error: "Advertised price unverified",
          message:
            "We could not confirm with our payment provider that this checkout charges the " +
            "advertised price, so it was stopped. You have not been charged. Please try again " +
            "shortly.",
          reasons,
        },
      };
}
