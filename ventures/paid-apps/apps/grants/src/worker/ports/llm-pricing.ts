// USD per million tokens (Anthropic first-party list prices, cached 2026-11). Update when prices change;
// billing plans (src/shared/billing/plans.ts) are tested against these numbers.
// With LLM_PROVIDER=aws / aws-with-fallback (Claude Platform on AWS) calls are billed through AWS
// Marketplace, whose prices are not checked here and may differ; costMicros stays an estimate at
// first-party list prices until AWS's rates are read from the Marketplace listing and added.
export interface ModelPrice {
  inputPerMTok: number;
  outputPerMTok: number;
  cacheReadPerMTok: number;
  cacheWritePerMTok: number; // 5-minute TTL writes = 1.25x input
}

export const MODEL_PRICES: Record<string, ModelPrice> = {
  "claude-opus-5-5": {
    inputPerMTok: 4,
    outputPerMTok: 20,
    cacheReadPerMTok: 0.2,
    cacheWritePerMTok: 5,
  },
  "claude-sonnet-5-5": {
    inputPerMTok: 2,
    outputPerMTok: 10,
    cacheReadPerMTok: 0.1,
    cacheWritePerMTok: 2.5,
  },
  "claude-haiku-5-5": {
    inputPerMTok: 0.1,
    outputPerMTok: 0.5,
    cacheReadPerMTok: 0.01,
    cacheWritePerMTok: 0.125,
  },
  "claude-opus-5": {
    inputPerMTok: 5,
    outputPerMTok: 25,
    cacheReadPerMTok: 0.5,
    cacheWritePerMTok: 6.25,
  },
  "claude-opus-4-8": {
    inputPerMTok: 5,
    outputPerMTok: 25,
    cacheReadPerMTok: 0.5,
    cacheWritePerMTok: 6.25,
  },
};

/** Cost in micro-USD (1e-6 USD). Unknown models are priced as Opus 5.5 (conservative). */
export function costMicros(
  model: string,
  u: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  },
): number {
  const p = MODEL_PRICES[model] ?? (MODEL_PRICES["claude-opus-5-5"] as ModelPrice);
  // tokens * $/MTok = micro-USD
  return Math.round(
    u.inputTokens * p.inputPerMTok +
      u.outputTokens * p.outputPerMTok +
      u.cacheReadTokens * p.cacheReadPerMTok +
      u.cacheWriteTokens * p.cacheWritePerMTok,
  );
}
