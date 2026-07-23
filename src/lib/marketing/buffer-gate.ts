/**
 * Shared ALLOW_MARKETING_SCHEDULING + BUFFER_ACCESS_TOKEN gate for the Buffer
 * auto-posting dashboard actions (marketing-content-scheduling tier-6
 * empty-backlog scaffold). Mirrors src/lib/commerce/stripe-connect-gate.ts
 * exactly (same opt-in-flag shape, same 403/501 split) — pure env reads,
 * unit-testable without a real Buffer account.
 *
 * Scope note: Buffer's classic API authenticates with a single long-lived
 * access token tied to the OPERATOR's own Buffer account (obtained once via
 * https://buffer.com/developers/apps, not a per-lead OAuth dance) — unlike
 * Google Business Profile / Meta, which need a distinct OAuth grant per local
 * business and stay fully gated (see the marketing-content-scheduling
 * NEXT_STEPS entry). An agency operator connects each client's own social
 * profiles into that one Buffer account and this app maps a lead to the
 * specific profile ids the operator selects — never posts anywhere without
 * that explicit per-lead mapping. Default OFF (flag unset/non-"1") on every
 * deploy, same as ALLOW_STRIPE_CONNECT_ONBOARDING / ALLOW_STRIPE_BOOTSTRAP.
 */

export type MarketingSchedulingGate =
  | { ok: true; accessToken: string }
  | {
      ok: false;
      status: 403 | 501;
      error: string;
      message: string;
    };

type EnvLike = NodeJS.ProcessEnv | Record<string, string | undefined>;

/** True when the operator has explicitly opted in to Buffer auto-posting on this deploy. */
export function isMarketingSchedulingAllowed(env: EnvLike = process.env): boolean {
  return env.ALLOW_MARKETING_SCHEDULING === "1";
}

/**
 * Assess whether Buffer profile listing / lead-profile mapping / pack
 * scheduling may run.
 * - Flag unset/non-1 → 403 (opt-in required)
 * - Missing BUFFER_ACCESS_TOKEN → 501
 */
export function assessMarketingSchedulingGate(
  env: EnvLike = process.env,
): MarketingSchedulingGate {
  if (env.ALLOW_MARKETING_SCHEDULING !== "1") {
    return {
      ok: false,
      status: 403,
      error: "Marketing scheduling disabled",
      message:
        "Set ALLOW_MARKETING_SCHEDULING=1 (and BUFFER_ACCESS_TOKEN) in the environment to enable Buffer auto-posting.",
    };
  }

  const accessToken = env.BUFFER_ACCESS_TOKEN?.trim();
  if (!accessToken) {
    return {
      ok: false,
      status: 501,
      error: "Buffer not configured",
      message: "Set BUFFER_ACCESS_TOKEN before scheduling posts to Buffer.",
    };
  }

  return { ok: true, accessToken };
}
