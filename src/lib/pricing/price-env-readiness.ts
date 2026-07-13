/**
 * Operator-visible readiness for bundle/commerce Stripe Price ID env vars.
 *
 * Checkout fails at session-create when these are missing — this helper lets
 * the dashboard and launch checklist surface the gap earlier without claiming
 * stripe-price-objects (bootstrap + paste secrets) is done.
 *
 * Pure: pass an env map in tests; production call sites use process.env.
 */

import { BUNDLES, COMMERCE_ADDON } from "./bundles";

export type BundlePriceEnvReadiness = {
  /** True when every required Price env var is non-empty after trim. */
  ready: boolean;
  /** Canonical required env names from BUNDLES + COMMERCE_ADDON. */
  required: readonly string[];
  /** Subset of required that are present. */
  present: readonly string[];
  /** Subset of required that are missing or whitespace-only. */
  missing: readonly string[];
};

/** Stable list of env var names checkout needs for all tiers + Commerce. */
export function listRequiredBundlePriceEnvNames(): string[] {
  const names: string[] = [];
  for (const bundle of BUNDLES) {
    names.push(bundle.setupPriceIdEnv);
    if (bundle.monthlyPriceIdEnv) {
      names.push(bundle.monthlyPriceIdEnv);
    }
  }
  names.push(COMMERCE_ADDON.setupPriceIdEnv, COMMERCE_ADDON.monthlyPriceIdEnv);
  return names;
}

function envValuePresent(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
  name: string,
): boolean {
  const raw = env[name];
  return typeof raw === "string" && raw.trim().length > 0;
}

/**
 * Assess which STRIPE_PRICE_ID_* vars from BUNDLES + COMMERCE_ADDON are set.
 * Does not call Stripe — readiness is env presence only (bootstrap still
 * operator-gated via ALLOW_STRIPE_BOOTSTRAP).
 */
export function assessBundlePriceEnvReadiness(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): BundlePriceEnvReadiness {
  const required = listRequiredBundlePriceEnvNames();
  const present: string[] = [];
  const missing: string[] = [];
  for (const name of required) {
    if (envValuePresent(env, name)) {
      present.push(name);
    } else {
      missing.push(name);
    }
  }
  return {
    ready: missing.length === 0,
    required,
    present,
    missing,
  };
}
