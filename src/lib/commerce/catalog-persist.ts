import type { ConvexPrimaryWriteOptions } from "@/lib/payments/convex-primary";

/**
 * Commerce catalog persist policy for Save catalog / Sync to Stripe.
 *
 * When Convex is configured, saveCommerceCatalogAction and
 * syncCommerceCatalogToStripeAction must pass COMMERCE_CATALOG_CONVEX_PRIMARY
 * so a Convex mutation failure surfaces to the operator instead of writing
 * only to instance-local SQLite. getCommerceCatalog / listCommerceCatalogs
 * (Buy now, Sync to Stripe due, pipeline-health, digest) read Convex-first —
 * a SQLite-only catalog with stripePriceId leaves other instances treating
 * SKUs as unsynced and blocks Commerce Buy now revenue.
 *
 * Mirrors COMMERCE_PAID_OUT_CONVEX_PRIMARY (operator action, fail closed,
 * operator retries). Stripe Product/Price creation in Sync to Stripe is
 * idempotent on commerceSkuStripeKey, so a failed persist after a successful
 * Stripe sync can safely retry. Dashboard keeps the Convex→SQLite fallback
 * when Convex is not configured.
 */

/** Fail-closed write options for commerce catalog upserts. */
export const COMMERCE_CATALOG_CONVEX_PRIMARY: ConvexPrimaryWriteOptions = {
  requireConvex: true,
};
