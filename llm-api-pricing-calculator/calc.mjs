// LLM API Pricing Calculator -- arithmetic only, no network, no vendor
// pricing baked in. One thing a developer sizing an LLM API bill needs and
// usually gets wrong: modern APIs bill three different token classes at
// three different rates --
//
//   1. Fresh input tokens -- the ordinary "you send us N tokens, we charge
//      the full input rate" case.
//   2. Cached input tokens -- tokens the provider has already seen recently
//      (a system prompt, a long document, prior turns of an agentic loop)
//      and can serve from a cache at a steep discount, commonly a fifth to a
//      tenth of the fresh-input rate. Agentic and long-context workloads
//      that resend the same context on every turn can have this be the
//      *majority* of billed input tokens, which makes it the dominant line
//      item a blended "$X per million input tokens" estimate misses.
//   3. Output tokens -- billed at their own, usually highest, rate.
//
// Rather than assert any provider's current per-token rate as fact (which
// would go stale the moment a vendor repriced, and a wrong number here is a
// real liability issue -- see PRODUCT_PLAYBOOK.md 5b), every rate here is a
// number the caller supplies. This module only does the multiplication and
// the ranking; ventures/vector-db-cost-calculator/calc.mjs uses the same
// bring-your-own-rates discipline for a different domain.

const MILLION = 1_000_000;

function assertNonNegative(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }
}

/**
 * One provider's monthly bill for a given monthly token workload: each of
 * the three token classes, priced at its own $/million-token rate, summed.
 * `freshInputTokens` / `cachedInputTokens` / `outputTokens` are the same
 * workload figures the caller normally repeats across every provider row
 * (the tokens you send don't change per vendor); `inputRate` /
 * `cachedInputRate` / `outputRate` are the $ per million tokens the caller
 * pastes in from that provider's own pricing page.
 */
export function providerMonthlyCost({
  name,
  freshInputTokens,
  cachedInputTokens,
  outputTokens,
  inputRate,
  cachedInputRate,
  outputRate,
}) {
  assertNonNegative(freshInputTokens, "Fresh input tokens");
  assertNonNegative(cachedInputTokens, "Cached input tokens");
  assertNonNegative(outputTokens, "Output tokens");
  assertNonNegative(inputRate, `${name || "Provider"} input rate`);
  assertNonNegative(cachedInputRate, `${name || "Provider"} cached-input rate`);
  assertNonNegative(outputRate, `${name || "Provider"} output rate`);

  const inputCost = (freshInputTokens / MILLION) * inputRate;
  const cachedInputCost = (cachedInputTokens / MILLION) * cachedInputRate;
  const outputCost = (outputTokens / MILLION) * outputRate;

  return {
    name: name || "Provider",
    inputCost,
    cachedInputCost,
    outputCost,
    total: inputCost + cachedInputCost + outputCost,
  };
}

/**
 * Ranks every provider row by total monthly cost (ascending) and names the
 * cheapest. `providers` is an array of the same shape `providerMonthlyCost`
 * takes, each normally carrying the same workload figures (computed once by
 * the caller) alongside its own rates.
 */
export function compareProviders(providers) {
  if (!Array.isArray(providers) || providers.length === 0) {
    throw new Error("At least one provider is required.");
  }
  const results = providers.map((p) => providerMonthlyCost(p));
  const ranked = [...results].sort((a, b) => a.total - b.total);
  const cheapest = ranked[0];
  const mostExpensive = ranked[ranked.length - 1];
  return {
    results,
    ranked,
    cheapestName: cheapest.name,
    cheapestTotal: cheapest.total,
    spread: mostExpensive.total - cheapest.total,
  };
}

/**
 * What share of the total input tokens (fresh + cached) are cached, as a
 * fraction 0..1, or null when there is no input volume at all to take a
 * share of. Surfaced separately from the cost arithmetic because it is the
 * number that explains *why* a bill looks the way it does -- a workload
 * that is 90% cache reads is the case a blended per-token estimate gets
 * most wrong, and this lets the page say so without re-deriving it from the
 * cost totals.
 */
export function cachedInputShare({ freshInputTokens, cachedInputTokens }) {
  assertNonNegative(freshInputTokens, "Fresh input tokens");
  assertNonNegative(cachedInputTokens, "Cached input tokens");
  const totalInput = freshInputTokens + cachedInputTokens;
  if (totalInput === 0) return null;
  return cachedInputTokens / totalInput;
}

/**
 * What a provider's cache discount is worth: the difference between billing
 * every cached token at the fresh-input rate and billing it at the
 * provider's actual cached-input rate. A negative or zero result means the
 * "cached" rate entered is not actually cheaper than the fresh rate for
 * that provider -- which the caller may want to see rather than have
 * silently folded into the total.
 */
export function cacheSavings({ cachedInputTokens, inputRate, cachedInputRate }) {
  assertNonNegative(cachedInputTokens, "Cached input tokens");
  assertNonNegative(inputRate, "Input rate");
  assertNonNegative(cachedInputRate, "Cached-input rate");
  const atFreshRate = (cachedInputTokens / MILLION) * inputRate;
  const atCachedRate = (cachedInputTokens / MILLION) * cachedInputRate;
  return atFreshRate - atCachedRate;
}

/** Plain-text decision summary suitable for pasting into a ticket or note. */
export function decisionSummary({ freshInputTokens, cachedInputTokens, outputTokens, providers }) {
  const { ranked, spread } = compareProviders(providers);
  const share = cachedInputShare({ freshInputTokens, cachedInputTokens });
  const lines = [
    `LLM API monthly cost estimate: ${freshInputTokens.toLocaleString()} fresh input + ${cachedInputTokens.toLocaleString()} cached input + ${outputTokens.toLocaleString()} output tokens/month`,
    share === null ? null : `Cached share of input tokens: ${(share * 100).toFixed(1)}%`,
    ...ranked.map((r, i) => `${i + 1}. ${r.name}: $${r.total.toFixed(2)}/month (input $${r.inputCost.toFixed(2)}, cached input $${r.cachedInputCost.toFixed(2)}, output $${r.outputCost.toFixed(2)})`),
    spread > 0
      ? `Spread: $${spread.toFixed(2)}/month between cheapest and most expensive.`
      : "All providers total the same at these rates.",
    "Estimate only, from rates you entered -- verify against each provider's current pricing before deciding.",
  ].filter((line) => line !== null);
  return lines.join("\n");
}
