/**
 * Shared ALLOW_STRIPE_CONNECT_ONBOARDING + STRIPE_SECRET_KEY gate for the
 * Stripe Connect Express account-creation/onboarding-link dashboard actions.
 * Mirrors src/lib/pricing/bootstrap-gate.ts exactly (same opt-in-flag shape,
 * same 403/501 split) — pure env reads, unit-testable without Stripe.
 *
 * Scope note (commerce-payouts-stripe-connect, tier-6 empty-backlog scaffold):
 * this gate only covers Connect Express ACCOUNT CREATION and status-checking,
 * which carry no money-movement risk and need no legal sign-off. It does NOT
 * enable transfer-on-charge / payout wiring — Commerce Buy now money still
 * lands entirely in the platform's own Stripe account until a future,
 * counsel-reviewed iteration adds destination charges or transfers. Default
 * OFF (flag unset/non-"1") on every deploy, same as ALLOW_STRIPE_BOOTSTRAP.
 */

export type StripeConnectOnboardingGate =
  | { ok: true }
  | {
      ok: false;
      status: 403 | 501;
      error: string;
      message: string;
    };

type EnvLike = NodeJS.ProcessEnv | Record<string, string | undefined>;

/** True when the operator has explicitly opted in to Connect account creation on this deploy. */
export function isStripeConnectOnboardingAllowed(env: EnvLike = process.env): boolean {
  return env.ALLOW_STRIPE_CONNECT_ONBOARDING === "1";
}

/**
 * Assess whether Stripe Connect Express account creation / onboarding-link
 * generation / status-checking may run.
 * - Flag unset/non-1 → 403 (opt-in required)
 * - Missing STRIPE_SECRET_KEY → 501
 */
export function assessStripeConnectOnboardingGate(
  env: EnvLike = process.env,
): StripeConnectOnboardingGate {
  if (env.ALLOW_STRIPE_CONNECT_ONBOARDING !== "1") {
    return {
      ok: false,
      status: 403,
      error: "Stripe Connect onboarding disabled",
      message:
        "Set ALLOW_STRIPE_CONNECT_ONBOARDING=1 (and STRIPE_SECRET_KEY) in the environment to enable Connect Express account creation for clients.",
    };
  }

  const secretKey = env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) {
    return {
      ok: false,
      status: 501,
      error: "Stripe not configured",
      message: "Set STRIPE_SECRET_KEY before creating Connect accounts.",
    };
  }

  return { ok: true };
}
