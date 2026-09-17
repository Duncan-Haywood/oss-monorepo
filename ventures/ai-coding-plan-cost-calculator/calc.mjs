// Compares a flat-rate AI coding assistant subscription (Claude Pro/Max,
// Cursor, GitHub Copilot, ChatGPT Plus, ...) against what the same usage
// would cost paid per token through the vendor's own API.
//
// The question this answers is the one that fills r/ClaudeAI, r/cursor and
// dozens of blog posts every month -- "is the $X/mo plan actually worth it
// for how I use this, or would API billing be cheaper?" -- and it is a real
// arithmetic question nobody answers with your own numbers: vendor pricing
// pages quote per-plan and per-token rates on separate pages and never do
// the multiplication for a specific usage pattern.
//
// Every rate and every usage number is a caller-supplied input, never a
// hidden constant -- the same rule estimate.mjs (this portfolio's other
// cost-model venture) follows, for the same reason: a figure you cannot see
// or override is not worth acting on, and list prices change without
// notice. Nothing here makes a network call.

/** Per-million-token USD rates as commonly published for the listed model
 * family. Cache reads are billed far below fresh input on providers that
 * support prompt caching, which matters here because agentic coding tools
 * re-send large, mostly-unchanged context on almost every turn -- publicly
 * reported usage breakdowns put cache reads above 90% of total tokens for
 * heavy Claude Code users, so a calculator that only models input/output
 * understates the case for the subscription. Treat these as a dated
 * starting point, not a live quote -- every field is editable in the UI.
 */
export const RATES_AS_OF = '2026-09-17';

/** Added 2026-09-17: the tool let a visitor pick ChatGPT Plus, Cursor, or
 * GitHub Copilot as their *subscription*, then only ever offered Claude API
 * rates for the "same usage paid per token" side -- correct for a Claude
 * plan, silently wrong (or just missing) for the other three named vendors
 * on their own tool page. `openai-gpt` and `gemini` close that gap.
 *
 * Anthropic charges a write premium (25% over fresh input) to populate the
 * cache, then a steep discount to read it back. OpenAI's and Google's
 * automatic prompt caching do not bill the write step at all -- only reads,
 * at roughly 10% of the fresh-input rate on both -- so `cacheWrite: 0` below
 * is a modelling choice, not a placeholder. Google's *explicit* cache API
 * additionally bills storage per hour rather than per token; this
 * calculator has no per-hour field, so that cost is not represented here --
 * a heavy explicit-cache user should treat the Gemini API-side total as a
 * floor and check the vendor's own pricing page, exactly as the no-warranty
 * clause already asks for every preset.
 */
export const MODEL_PRESETS = {
  'claude-opus': {
    label: 'Claude Opus (API)',
    input: 15,
    output: 75,
    cacheWrite: 18.75,
    cacheRead: 1.5,
  },
  'claude-sonnet': {
    label: 'Claude Sonnet (API)',
    input: 3,
    output: 15,
    cacheWrite: 3.75,
    cacheRead: 0.3,
  },
  'claude-haiku': {
    label: 'Claude Haiku (API)',
    input: 0.8,
    output: 4,
    cacheWrite: 1,
    cacheRead: 0.08,
  },
  'openai-gpt': {
    label: 'OpenAI GPT (API)',
    input: 1.25,
    output: 10,
    cacheWrite: 0,
    cacheRead: 0.125,
  },
  gemini: {
    label: 'Google Gemini (API)',
    input: 2,
    output: 12,
    cacheWrite: 0,
    cacheRead: 0.2,
  },
  custom: { label: 'Custom rates', input: 0, output: 0, cacheWrite: 0, cacheRead: 0 },
};

/** Which model preset a plan's own API most plausibly maps to, used only to
 * pick a less-wrong default when the visitor switches plans -- every field
 * stays editable, so a mismatch here costs nothing but one extra click.
 * Cursor and Copilot are multi-model products with no single "own API"; both
 * default to the closest well-known backing model rather than left on
 * whatever the previous plan happened to select.
 */
export const PLAN_MODEL_DEFAULT = {
  'claude-pro': 'claude-sonnet',
  'claude-max-5x': 'claude-sonnet',
  'claude-max-20x': 'claude-opus',
  'cursor-pro': 'claude-sonnet',
  'cursor-business': 'claude-sonnet',
  'copilot-individual': 'openai-gpt',
  'copilot-business': 'openai-gpt',
  'chatgpt-plus': 'openai-gpt',
  custom: 'custom',
};

/** Flat-rate plan starting points. `seats` defaults to 1; business/team
 * plans are billed per seat, so the UI multiplies by however many the
 * caller enters. Prices are list prices at RATES_AS_OF and change without
 * notice -- confirm on the vendor's own pricing page before deciding.
 */
export const PLAN_PRESETS = {
  'claude-pro': { label: 'Claude Pro', monthlyUsd: 20 },
  'claude-max-5x': { label: 'Claude Max 5x', monthlyUsd: 100 },
  'claude-max-20x': { label: 'Claude Max 20x', monthlyUsd: 200 },
  'cursor-pro': { label: 'Cursor Pro', monthlyUsd: 20 },
  'cursor-business': { label: 'Cursor Business (per seat)', monthlyUsd: 40 },
  'copilot-individual': { label: 'GitHub Copilot Individual', monthlyUsd: 10 },
  'copilot-business': { label: 'GitHub Copilot Business (per seat)', monthlyUsd: 19 },
  'chatgpt-plus': { label: 'ChatGPT Plus', monthlyUsd: 20 },
  custom: { label: 'Custom plan', monthlyUsd: 0 },
};

/** Daily token starting points for three usage bands. These are rough,
 * order-of-magnitude figures reasoned from publicly reported Claude Code
 * usage (heavy cache-read share, output a small fraction of the total) --
 * not a measurement of any one account. Every field is an editable input;
 * treat the tier as a starting point to correct, not an answer.
 */
export const USAGE_TIERS = {
  light: {
    label: 'Light — a few sessions a week',
    inputTokens: 40_000,
    outputTokens: 15_000,
    cacheWriteTokens: 60_000,
    cacheReadTokens: 400_000,
  },
  typical: {
    label: 'Typical — daily use, part of the working day',
    inputTokens: 150_000,
    outputTokens: 60_000,
    cacheWriteTokens: 250_000,
    cacheReadTokens: 3_000_000,
  },
  heavy: {
    label: 'Heavy — most of the day, agentic loops',
    inputTokens: 400_000,
    outputTokens: 150_000,
    cacheWriteTokens: 700_000,
    cacheReadTokens: 12_000_000,
  },
  custom: {
    label: 'Custom usage',
    inputTokens: 0,
    outputTokens: 0,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
  },
};

/** Cost of one day's token usage, in USD, at the given per-million rates. */
export function dailyApiCostUsd(usage, rates) {
  return (
    (usage.inputTokens / 1e6) * rates.input +
    (usage.outputTokens / 1e6) * rates.output +
    (usage.cacheWriteTokens / 1e6) * rates.cacheWrite +
    (usage.cacheReadTokens / 1e6) * rates.cacheRead
  );
}

/**
 * Full comparison. `usage` is per-*active day* token counts; `activeDays`
 * is how many days a month the tool is actually used (default 21, a
 * working month) -- a light user who codes three days a week should lower
 * this rather than shrink their per-day tokens.
 *
 * `includedTokensPerMonth` is the plan's included allowance before overflow
 * is billed per token. Added 2026-09-17, and it corrects a modelling error
 * rather than adding a nicety: until then this function treated every
 * subscription as *unlimited*, so a heavy user -- the exact visitor this
 * tool is for, and the one who hits a plan's ceiling -- was told the flat
 * fee was their whole cost when in practice they exhaust the allowance
 * mid-month and pay per token (or stop working) from there. The bias ran
 * one way: it always overstated the subscription's case.
 *
 * It is `null` by default and on every preset, and that is deliberate.
 * Vendors publish coding-plan limits in opaque, changing units -- messages,
 * "premium requests", rolling five-hour windows -- not in tokens, so this
 * repository has no honest token figure to ship for any named plan.
 * Inventing one would be a fabricated number wearing a default's clothes.
 * The visitor supplies their own estimate or leaves it blank, and blank
 * behaves exactly as before.
 */
export function compare({
  planMonthlyUsd,
  seats = 1,
  usage,
  rates,
  activeDaysPerMonth = 21,
  includedTokensPerMonth = null,
}) {
  if (!Number.isFinite(planMonthlyUsd) || planMonthlyUsd < 0) {
    throw new RangeError('planMonthlyUsd must be a non-negative number');
  }
  if (!Number.isFinite(seats) || seats < 1) {
    throw new RangeError('seats must be at least 1');
  }
  if (!Number.isFinite(activeDaysPerMonth) || activeDaysPerMonth < 0) {
    throw new RangeError('activeDaysPerMonth must be a non-negative number');
  }
  if (
    includedTokensPerMonth !== null &&
    (!Number.isFinite(includedTokensPerMonth) || includedTokensPerMonth < 0)
  ) {
    throw new RangeError('includedTokensPerMonth must be a non-negative number or null');
  }
  for (const field of ['inputTokens', 'outputTokens', 'cacheWriteTokens', 'cacheReadTokens']) {
    if (!Number.isFinite(usage[field]) || usage[field] < 0) {
      throw new RangeError(`usage.${field} must be a non-negative number`);
    }
  }
  for (const field of ['input', 'output', 'cacheWrite', 'cacheRead']) {
    if (!Number.isFinite(rates[field]) || rates[field] < 0) {
      throw new RangeError(`rates.${field} must be a non-negative number`);
    }
  }

  const subscriptionMonthlyUsd = planMonthlyUsd * seats;
  const dailyApiUsd = dailyApiCostUsd(usage, rates);
  const apiMonthlyUsd = dailyApiUsd * activeDaysPerMonth;

  const dailyTokens =
    usage.inputTokens + usage.outputTokens + usage.cacheWriteTokens + usage.cacheReadTokens;
  const monthlyTokens = dailyTokens * activeDaysPerMonth;

  // What share of the month's tokens the allowance actually covers. The
  // overflow is charged at the same per-token rates as the all-API column,
  // and every token category is scaled by the same fraction: the allowance
  // is consumed by whatever mix the visitor entered, not preferentially by
  // the cheap tokens or the dear ones. Assuming otherwise would need a
  // billing rule no vendor publishes.
  const capped = includedTokensPerMonth !== null;
  const quotaCoveredFraction = !capped
    ? 1
    : monthlyTokens > 0
      ? Math.min(1, includedTokensPerMonth / monthlyTokens)
      : 1;
  const overflowTokens = capped ? Math.max(0, monthlyTokens - includedTokensPerMonth) : 0;
  const overflowMonthlyUsd = apiMonthlyUsd * (1 - quotaCoveredFraction);

  // The honest total for staying on the plan: the flat fee plus whatever
  // the month's overflow costs at API rates. With no cap this is the flat
  // fee, so every field below keeps the meaning it had before.
  const planTotalMonthlyUsd = subscriptionMonthlyUsd + overflowMonthlyUsd;
  const deltaUsd = apiMonthlyUsd - planTotalMonthlyUsd;
  // deltaUsd > 0: the subscription is cheaper (API would cost more).
  const cheaper = deltaUsd > 1e-9 ? 'subscription' : deltaUsd < -1e-9 ? 'api' : 'tie';

  // Which active day the allowance runs out on. Null when there is no cap,
  // no usage, or the month ends before the allowance does -- the three
  // cases where there is no such day rather than a day we failed to find.
  const quotaExhaustedOnDay =
    capped && dailyTokens > 0 && overflowTokens > 0
      ? Math.min(activeDaysPerMonth, Math.floor(includedTokensPerMonth / dailyTokens) + 1)
      : null;

  // The usage scale (as a multiple of the entered usage) at which the two
  // are equal -- e.g. 1.4 means "at 140% of the entered usage, API billing
  // catches up to the subscription's price". Null when the API cost is
  // already zero (nothing to scale).
  //
  // A cap changes the shape of this question, and the arithmetic is worth
  // stating because the answer is counter-intuitive. Scale the usage by s.
  // Below the cap the plan costs the flat fee P and the API costs sA, so
  // they cross at s = P/A, exactly as before. Above the cap the overflow is
  // sA - A*C/T, so the plan costs P + sA - A*C/T and the gap between the
  // two columns is A*C/T - P: a CONSTANT, with no s in it. Past the
  // allowance, growing usage no longer moves the comparison at all -- both
  // columns rise by the same amount -- so there is no second crossing, and
  // reporting the uncapped s = P/A there would be a straightforwardly wrong
  // number. Null, plus the constant below, is the truthful answer.
  const uncappedScale = apiMonthlyUsd > 0 ? subscriptionMonthlyUsd / apiMonthlyUsd : null;
  const crossingIsBelowTheCap =
    !capped || (uncappedScale !== null && uncappedScale * monthlyTokens <= includedTokensPerMonth);
  const breakEvenUsageScale = crossingIsBelowTheCap ? uncappedScale : null;

  // What the included allowance is worth at the entered API rates, minus
  // what the plan costs: the fixed monthly saving (or loss) once usage is
  // past the cap. Null without a cap, where the advantage is not fixed.
  // `apiMonthlyUsd / monthlyTokens` is the blended $/token of the mix the
  // visitor entered, so this is the allowance valued at their own rates.
  // The allowance is used whole, not clamped to this month's usage: a cap
  // larger than the month's tokens is still the constant that would apply
  // once usage grew past it, which is the question this answers.
  const beyondQuotaAdvantageUsd =
    capped && monthlyTokens > 0
      ? (apiMonthlyUsd / monthlyTokens) * includedTokensPerMonth - subscriptionMonthlyUsd
      : null;

  return {
    subscriptionMonthlyUsd,
    apiMonthlyUsd,
    deltaUsd,
    cheaper,
    breakEvenUsageScale,
    dailyApiUsd,
    includedTokensPerMonth,
    monthlyTokens,
    quotaCoveredFraction,
    overflowTokens,
    overflowMonthlyUsd,
    planTotalMonthlyUsd,
    quotaExhaustedOnDay,
    beyondQuotaAdvantageUsd,
  };
}

export function formatUsd(n) {
  const abs = Math.abs(n);
  const digits = abs > 0 && abs < 10 ? 2 : 0;
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
