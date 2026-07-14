/**
 * Operator-visible readiness for core Stripe secrets (not Price IDs).
 *
 * BundlePriceEnvBanner already covers STRIPE_PRICE_ID_* — this helper surfaces
 * the earlier sale/fulfillment blockers:
 *   - STRIPE_SECRET_KEY → checkout / portal / sync 501 when missing
 *   - STRIPE_WEBHOOK_SECRET → webhook 501 (Stripe can charge; CRM never records)
 *
 * NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is deliberately NOT required here: every
 * checkout flow in this codebase (bundle + commerce Buy now) redirects to a
 * Stripe-hosted Checkout Session URL server-side — there is no @stripe/stripe-js
 * / loadStripe call site that would ever read a publishable key. Requiring it
 * only added operator setup friction with no functional payoff; see
 * BUSINESS_DECISIONS in src/lib/process/prompt_process.tsx.
 *
 * Pure: pass an env map in tests; production call sites use process.env.
 * Does not call Stripe and does not fake-complete stripe-price-objects.
 */

export type EnvLike = NodeJS.ProcessEnv | Record<string, string | undefined>;

export const STRIPE_CORE_ENV_NAMES = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"] as const;

export type StripeCoreEnvName = (typeof STRIPE_CORE_ENV_NAMES)[number];

export type StripeCoreEnvReadiness = {
  /** True when every core Stripe secret is non-empty after trim. */
  ready: boolean;
  /** Canonical required env names. */
  required: readonly StripeCoreEnvName[];
  /** Subset of required that are present. */
  present: readonly StripeCoreEnvName[];
  /** Subset of required that are missing or whitespace-only. */
  missing: readonly StripeCoreEnvName[];
  /** True when STRIPE_SECRET_KEY is set (checkout create possible). */
  secretKeyReady: boolean;
  /** True when STRIPE_WEBHOOK_SECRET is set (fulfillment possible). */
  webhookSecretReady: boolean;
};

function envValuePresent(env: EnvLike, name: string): boolean {
  const raw = env[name];
  return typeof raw === "string" && raw.trim().length > 0;
}

/** Stable list of core Stripe env names from launch checklist / .env.example. */
export function listRequiredStripeCoreEnvNames(): StripeCoreEnvName[] {
  return [...STRIPE_CORE_ENV_NAMES];
}

/**
 * Assess which core Stripe secrets are set.
 * Env presence only — does not validate key format or call Stripe.
 */
export function assessStripeCoreEnvReadiness(
  env: EnvLike = process.env,
): StripeCoreEnvReadiness {
  const required = listRequiredStripeCoreEnvNames();
  const present: StripeCoreEnvName[] = [];
  const missing: StripeCoreEnvName[] = [];
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
    secretKeyReady: envValuePresent(env, "STRIPE_SECRET_KEY"),
    webhookSecretReady: envValuePresent(env, "STRIPE_WEBHOOK_SECRET"),
  };
}
