/**
 * Shared ALLOW_STRIPE_BOOTSTRAP + STRIPE_SECRET_KEY gate for the bootstrap
 * API route and the operator dashboard action. Pure env reads — unit-testable
 * without Stripe. Does not fake-complete stripe-price-objects: operators still
 * paste envSnippet and unset the flag.
 */

export type StripeBootstrapGate =
  | { ok: true }
  | {
      ok: false;
      status: 403 | 501;
      error: string;
      message: string;
    };

type EnvLike = NodeJS.ProcessEnv | Record<string, string | undefined>;

/** True when the operator has explicitly opted in to bootstrap this deploy. */
export function isStripeBootstrapAllowed(
  env: EnvLike = process.env,
): boolean {
  return env.ALLOW_STRIPE_BOOTSTRAP === "1";
}

/**
 * Assess whether Stripe Price bootstrap may run.
 * - Flag unset/non-1 → 403 (opt-in required)
 * - Missing STRIPE_SECRET_KEY → 501
 */
export function assessStripeBootstrapGate(
  env: EnvLike = process.env,
): StripeBootstrapGate {
  if (env.ALLOW_STRIPE_BOOTSTRAP !== "1") {
    return {
      ok: false,
      status: 403,
      error: "Stripe price bootstrap disabled",
      message:
        "Set ALLOW_STRIPE_BOOTSTRAP=1 (and STRIPE_SECRET_KEY) in the environment, then try again. Disable the flag after copying Price IDs into secrets.",
    };
  }

  const secretKey = env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) {
    return {
      ok: false,
      status: 501,
      error: "Stripe not configured",
      message: "Set STRIPE_SECRET_KEY before bootstrapping prices.",
    };
  }

  return { ok: true };
}
