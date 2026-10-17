// Zero-dependency, deterministic comparison of what speech-to-text (transcription) services charge
// for a number of audio hours per month, optionally needing real-time streaming and/or speaker
// labels (diarization). Each provider is a short list of plans; the cheapest plan that covers the
// need wins. A plan is a base fee with some hours included and a per-extra-hour rate, which models
// pay-as-you-go (base 0, 0 included), flat subscriptions and a self-hosted GPU box alike.
// Pure data in, report out -- no filesystem or network here (cli.mjs and index.html supply input).
//
// This is arithmetic on three typed needs and editable plan tables. It is not a quote and not a
// guarantee: the real invoice also depends on language and model choice, word-level timestamps,
// redaction and other add-ons, volume discounts, committed-use deals, free credits, minimum
// billing increments, taxes and (for self-hosting) engineering time, none of which this file prices.

export const PRICES_AS_OF = "approximate public list prices as best known in 2025, pay-as-you-go, USD per audio hour -- vendors change prices often; verify each at its own pricing page";

// Editable. A plan covers a need when it supports streaming/diarization if wanted, and hours <= plan.hours
// or extraHourUsd is set (which then buys the excess hours).
export const DEFAULT_PROVIDERS = {
  openai: { label: "OpenAI Whisper API", url: "https://openai.com/api/pricing/", plans: [
    { name: "whisper-1 ($0.006/min)", usd: 0, hours: 0, extraHourUsd: 0.36, streaming: false, diarization: false },
    { name: "gpt-4o-mini-transcribe ($0.003/min)", usd: 0, hours: 0, extraHourUsd: 0.18, streaming: true, diarization: false },
  ] },
  deepgram: { label: "Deepgram Nova-3", url: "https://deepgram.com/pricing", plans: [
    { name: "pre-recorded", usd: 0, hours: 0, extraHourUsd: 0.26, streaming: false, diarization: false },
    { name: "pre-recorded + diarization", usd: 0, hours: 0, extraHourUsd: 0.38, streaming: false, diarization: true },
    { name: "streaming", usd: 0, hours: 0, extraHourUsd: 0.46, streaming: true, diarization: false },
    { name: "streaming + diarization", usd: 0, hours: 0, extraHourUsd: 0.58, streaming: true, diarization: true },
  ] },
  assemblyai: { label: "AssemblyAI", url: "https://www.assemblyai.com/pricing", plans: [
    { name: "Universal (pre-recorded)", usd: 0, hours: 0, extraHourUsd: 0.15, streaming: false, diarization: false },
    { name: "Universal + speaker labels", usd: 0, hours: 0, extraHourUsd: 0.17, streaming: false, diarization: true },
    { name: "Universal streaming", usd: 0, hours: 0, extraHourUsd: 0.15, streaming: true, diarization: false },
  ] },
  google: { label: "Google Cloud Speech-to-Text", url: "https://cloud.google.com/speech-to-text/pricing", plans: [
    { name: "V2 standard (per-minute, speaker labels included)", usd: 0, hours: 0, extraHourUsd: 0.96, streaming: true, diarization: true },
  ] },
  aws: { label: "AWS Transcribe", url: "https://aws.amazon.com/transcribe/pricing/", plans: [
    { name: "standard (per-second billing, tier 1)", usd: 0, hours: 0, extraHourUsd: 1.44, streaming: true, diarization: true },
  ] },
  azure: { label: "Azure AI Speech", url: "https://azure.microsoft.com/pricing/details/cognitive-services/speech-services/", plans: [
    { name: "standard real-time / batch", usd: 0, hours: 0, extraHourUsd: 1.0, streaming: true, diarization: true },
  ] },
  whisper: { label: "Self-host faster-whisper on a rented GPU", url: "https://github.com/SYSTRAN/faster-whisper", plans: [
    { name: "one 24 GB GPU box, 24/7 (batch + pyannote speaker labels)", usd: 360, hours: 5000, extraHourUsd: 0.07, streaming: false, diarization: true },
  ] },
};

const round2 = (n) => Math.round(n * 100) / 100;
const nn = (n) => Math.max(0, Number(n) || 0);

/** Cheapest plan of `p` covering the need, or null when none does. */
export function providerCost(p, hoursIn, streaming = false, diarization = false) {
  const hours = nn(hoursIn);
  let best = null;
  for (const plan of p.plans) {
    if (streaming && !plan.streaming) continue;
    if (diarization && !plan.diarization) continue;
    const extra = Math.max(0, hours - nn(plan.hours));
    if (extra > 0 && plan.extraHourUsd == null) continue;
    const monthly = round2(nn(plan.usd) + extra * nn(plan.extraHourUsd));
    if (!best || monthly < best.monthly) best = { plan: plan.name, monthly };
  }
  return best;
}

/** Every provider priced for the need, cheapest first; providers with no covering plan go last as unavailable. */
export function compare(hours, streaming = false, diarization = false, providers = DEFAULT_PROVIDERS) {
  const rows = Object.entries(providers).map(([key, p]) => {
    const c = providerCost(p, hours, streaming, diarization);
    return { key, label: p.label, url: p.url, plan: c ? c.plan : null, monthly: c ? c.monthly : null, annual: c ? round2(c.monthly * 12) : null };
  });
  rows.sort((a, b) => (a.monthly == null) - (b.monthly == null) || a.monthly - b.monthly || (a.label < b.label ? -1 : 1));
  const cheapest = rows[0].monthly;
  return rows.map((r) => ({ ...r, extraVsCheapest: r.monthly == null || cheapest == null ? null : round2(r.monthly - cheapest) }));
}

/** Month-by-month audio hours under compound growth and each provider's total over `months` (null if any month is uncovered). */
export function project(hours, streaming = false, diarization = false, growthPct = 0, months = 12, providers = DEFAULT_PROVIDERS) {
  const g = 1 + Math.max(-50, Number(growthPct) || 0) / 100;
  const path = [];
  for (let m = 0; m < months; m++) path.push(Math.round(nn(hours) * g ** m));
  const totals = Object.entries(providers).map(([key, p]) => {
    let total = 0;
    for (const n of path) {
      const c = providerCost(p, n, streaming, diarization);
      if (!c) return { key, label: p.label, total: null };
      total += c.monthly;
    }
    return { key, label: p.label, total: round2(total) };
  });
  totals.sort((a, b) => (a.total == null) - (b.total == null) || a.total - b.total || (a.label < b.label ? -1 : 1));
  return { path, endHours: path[path.length - 1], totals };
}

/** Which provider is cheapest as monthly audio hours grow, as segments `{from, to, key, label}`. */
export function cheapestSegments(streaming = false, diarization = false, providers = DEFAULT_PROVIDERS, maxHours = 20000) {
  const winner = (v) => {
    const rows = compare(v, streaming, diarization, providers).filter((r) => r.monthly != null);
    if (!rows.length) return { key: "none", label: "no listed plan covers this" };
    const tied = rows.filter((r) => r.monthly === rows[0].monthly);
    return { key: tied.map((r) => r.key).join("+"), label: tied.length > 1 ? `${tied.map((r) => r.label).join(", ")} (all ${fmt(rows[0].monthly)})` : `${rows[0].label} (${rows[0].plan})` };
  };
  const segs = [];
  let start = 1, prev = winner(1);
  for (let v = 2; v <= maxHours; v++) {
    const w = winner(v);
    if (w.key === prev.key) continue;
    segs.push({ from: start, to: v - 1, key: prev.key, label: prev.label });
    start = v; prev = w;
  }
  segs.push({ from: start, to: maxHours, key: prev.key, label: prev.label });
  return segs;
}

/** Summary and budget gate. `budget` is monthly USD or null; applies to `provider` or else the cheapest. */
export function summarize(rows, { budget = null, provider = null } = {}) {
  const pick = provider ? rows.find((r) => r.key === provider) : rows[0];
  if (!pick) return { status: "error", errors: 1, overBudget: false, text: `Unknown provider "${provider}".` };
  if (pick.monthly == null) return { status: "error", errors: 1, overBudget: false, text: `${pick.label} has no listed plan covering these hours, streaming and speaker-label needs.` };
  const overBudget = budget != null && pick.monthly > budget;
  let text = provider
    ? `${pick.label} (${pick.plan}) is about ${fmt(pick.monthly)} per month (${fmt(pick.annual)} per year) for this need.`
    : `Cheapest for this need: ${pick.label} (${pick.plan}), about ${fmt(pick.monthly)} per month (${fmt(pick.annual)} per year).`;
  const priced = rows.filter((r) => r.monthly != null);
  const worst = priced[priced.length - 1];
  if (worst.monthly > pick.monthly) text += ` The most expensive covering plan, ${worst.label} (${worst.plan}), is ${fmt(worst.monthly)}.`;
  if (overBudget) text += ` Over your ${fmt(budget)} monthly budget by ${fmt(pick.monthly - budget)}.`;
  return { status: overBudget ? "error" : "ok", errors: overBudget ? 1 : 0, overBudget, text };
}

export function fmt(n) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
