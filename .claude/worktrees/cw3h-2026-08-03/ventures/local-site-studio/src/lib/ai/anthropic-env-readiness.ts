/**
 * Operator-visible readiness for Growth/Complete AI pack generation (Anthropic).
 *
 * Stripe + Resend banners already cover payment and outreach secrets. Without a
 * real ANTHROPIC_API_KEY, createDefaultMarketingGenerator /
 * createDefaultClientVoiceGenerator silently use Stub* generators — operators
 * still get a pack, but sold "AI marketing engine" / Complete phone-script copy
 * is template quality with no dashboard signal.
 *
 * Matches the factory gate in src/lib/marketing/generators.ts and
 * src/lib/voice/generators.ts: missing / whitespace-only → stub. Also flags
 * documented .env.example placeholders (sk-ant-... / sk-ant-placeholder*) that
 * would otherwise call Anthropic, fail, and fall back to stub.
 *
 * Pure: pass an env map in tests; production call sites use process.env.
 * Does not call Anthropic and does not invent optional aggregates.
 */

export type EnvLike = NodeJS.ProcessEnv | Record<string, string | undefined>;

export const ANTHROPIC_ENV_NAMES = ["ANTHROPIC_API_KEY"] as const;

export type AnthropicEnvName = (typeof ANTHROPIC_ENV_NAMES)[number];

export type AnthropicEnvReadiness = {
  /** True when ANTHROPIC_API_KEY is a non-placeholder secret. */
  ready: boolean;
  /** Canonical required env names. */
  required: readonly AnthropicEnvName[];
  /** Subset of required that are present and usable. */
  present: readonly AnthropicEnvName[];
  /** Subset of required that are missing, whitespace-only, or placeholder. */
  missing: readonly AnthropicEnvName[];
  /** True when ANTHROPIC_API_KEY would select Anthropic* generators. */
  apiKeyReady: boolean;
  /** True when the value looks like a documented placeholder, not a real key. */
  placeholderDetected: boolean;
};

/** Stable list of Anthropic env names from launch checklist / .env.example. */
export function listRequiredAnthropicEnvNames(): AnthropicEnvName[] {
  return [...ANTHROPIC_ENV_NAMES];
}

/**
 * True when the value would select Anthropic* generators (and is not a
 * documented placeholder that would fail then stub-fallback).
 */
export function isAnthropicApiKeyConfigured(raw: string | undefined): boolean {
  if (typeof raw !== "string") {
    return false;
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return false;
  }
  if (isAnthropicApiKeyPlaceholder(trimmed)) {
    return false;
  }
  return true;
}

/** Documented .env.example / paste placeholders — not usable live keys. */
export function isAnthropicApiKeyPlaceholder(trimmed: string): boolean {
  if (trimmed === "sk-ant-..." || trimmed === "sk-ant-…") {
    return true;
  }
  if (trimmed.startsWith("sk-ant-placeholder")) {
    return true;
  }
  return false;
}

/**
 * Assess whether Growth/Complete AI packs will use Anthropic (not Stub*).
 * Env presence only — does not validate key format with Anthropic.
 */
export function assessAnthropicEnvReadiness(
  env: EnvLike = process.env,
): AnthropicEnvReadiness {
  const required = listRequiredAnthropicEnvNames();
  const raw = env.ANTHROPIC_API_KEY;
  const trimmed =
    typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : "";
  const placeholderDetected =
    trimmed.length > 0 && isAnthropicApiKeyPlaceholder(trimmed);
  const apiKeyReady = isAnthropicApiKeyConfigured(raw);
  const present: AnthropicEnvName[] = apiKeyReady ? ["ANTHROPIC_API_KEY"] : [];
  const missing: AnthropicEnvName[] = apiKeyReady ? [] : ["ANTHROPIC_API_KEY"];
  return {
    ready: apiKeyReady,
    required,
    present,
    missing,
    apiKeyReady,
    placeholderDetected,
  };
}
