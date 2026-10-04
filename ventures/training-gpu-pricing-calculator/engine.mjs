// Zero-dependency, deterministic comparison of what GPU clouds charge to run a workload for a
// number of busy GPU-hours a month, versus buying the card. Pure data in, report out -- no
// filesystem or network here (cli.mjs and index.html supply the input).
//
// This is arithmetic on typed hours and editable per-GPU-hour rates. It is not a quote and not a
// guarantee: real bills depend on region, availability, spot interruptions, commitments, egress,
// multi-GPU instance shapes, driver/OS images and each vendor's terms, none of which this file
// reproduces. GPU rental prices move quickly -- treat the defaults as a starting point to edit.

export const PRICES_AS_OF = "approximate on-demand list prices per GPU-hour as best known in 2025 -- GPU rental prices change often; verify each at its own pricing page";

export const HOURS_PER_MONTH = 730;

// Editable. `ownUsd` is a street price for one card, `watts` its draw under load.
export const GPUS = {
  rtx4090: { label: "RTX 4090 24GB", ownUsd: 1800, watts: 450 },
  l40s: { label: "L40S 48GB", ownUsd: 7500, watts: 350 },
  a100: { label: "A100 80GB", ownUsd: 10000, watts: 400 },
  h100: { label: "H100 80GB", ownUsd: 25000, watts: 700 },
};

// rates: USD per GPU-hour, null = not offered. idleBilled: you pay for every hour the instance is
// up (so busy hours / utilization are billed); false = billed per busy second (serverless).
// interruptionPct: extra hours re-run because interruptible capacity gets reclaimed.
export const DEFAULT_PROVIDERS = {
  runpod: { label: "RunPod (secure cloud)", url: "https://www.runpod.io/pricing", idleBilled: true, interruptionPct: 0, storagePerGbMonth: 0.07, rates: { rtx4090: 0.69, l40s: 0.86, a100: 1.64, h100: 2.99 } },
  lambda: { label: "Lambda Cloud", url: "https://lambda.ai/pricing", idleBilled: true, interruptionPct: 0, storagePerGbMonth: 0.2, rates: { rtx4090: null, l40s: null, a100: 1.79, h100: 2.99 } },
  vast: { label: "Vast.ai (marketplace, interruptible)", url: "https://vast.ai/pricing", idleBilled: true, interruptionPct: 10, storagePerGbMonth: 0.1, rates: { rtx4090: 0.4, l40s: 0.5, a100: 0.9, h100: 1.9 } },
  coreweave: { label: "CoreWeave", url: "https://www.coreweave.com/pricing", idleBilled: true, interruptionPct: 0, storagePerGbMonth: 0.07, rates: { rtx4090: null, l40s: 2.25, a100: 2.21, h100: 6.16 } },
  aws: { label: "AWS EC2 (on demand)", url: "https://aws.amazon.com/ec2/pricing/on-demand/", idleBilled: true, interruptionPct: 0, storagePerGbMonth: 0.08, rates: { rtx4090: null, l40s: 1.86, a100: 4.1, h100: 6.88 } },
  gcp: { label: "Google Cloud (on demand)", url: "https://cloud.google.com/compute/gpus-pricing", idleBilled: true, interruptionPct: 0, storagePerGbMonth: 0.04, rates: { rtx4090: null, l40s: null, a100: 3.67, h100: 11.06 } },
  modal: { label: "Modal (serverless, per second)", url: "https://modal.com/pricing", idleBilled: false, interruptionPct: 0, storagePerGbMonth: 0, rates: { rtx4090: null, l40s: 1.95, a100: 2.1, h100: 3.95 } },
};

export const DEFAULT_OWN = { kwhUsd: 0.15, months: 36, residualPct: 30, hostOverheadPct: 20 };

const round2 = (n) => Math.round(n * 100) / 100;
const nn = (n) => Math.max(0, Number(n) || 0);

/** Monthly cost of one provider for `gpu` x `count` busy for `busyHours` a month at `utilizationPct`. Null if not offered. */
export function providerCost(p, gpu, { count = 1, busyHours = 0, utilizationPct = 100, storageGb = 0 } = {}) {
  const rate = p.rates?.[gpu];
  if (rate == null) return null;
  const util = Math.min(100, Math.max(1, Number(utilizationPct) || 100)) / 100;
  const billedHours = Math.min(HOURS_PER_MONTH, (p.idleBilled ? nn(busyHours) / util : nn(busyHours)) * (1 + nn(p.interruptionPct) / 100));
  return round2(nn(rate) * Math.max(1, nn(count)) * billedHours + nn(storageGb) * nn(p.storagePerGbMonth));
}

/** Every provider that offers `gpu`, cheapest first; those that do not are listed in `unavailable`. */
export function compare(gpu, input, providers = DEFAULT_PROVIDERS) {
  const rows = [], unavailable = [];
  for (const [key, p] of Object.entries(providers)) {
    const monthly = providerCost(p, gpu, input);
    if (monthly == null) { unavailable.push({ key, label: p.label }); continue; }
    rows.push({ key, label: p.label, url: p.url, rate: p.rates[gpu], monthly, annual: round2(monthly * 12) });
  }
  rows.sort((a, b) => a.monthly - b.monthly || (a.label < b.label ? -1 : 1));
  const cheapest = rows.length ? rows[0].monthly : 0;
  return { rows: rows.map((r) => ({ ...r, extraVsCheapest: round2(r.monthly - cheapest) })), unavailable };
}

/** Monthly cost of owning `count` cards: depreciation over `months` after residual, host overhead and power at busy hours. */
export function ownCost(gpu, { count = 1, busyHours = 0 } = {}, own = DEFAULT_OWN, gpus = GPUS) {
  const g = gpus[gpu];
  const n = Math.max(1, nn(count));
  const capital = g.ownUsd * n * (1 + nn(own.hostOverheadPct) / 100);
  const depreciation = capital * (1 - Math.min(100, nn(own.residualPct)) / 100) / Math.max(1, nn(own.months));
  const power = g.watts * n * nn(busyHours) * nn(own.kwhUsd) / 1000;
  return { depreciation: round2(depreciation), power: round2(power), monthly: round2(depreciation + power) };
}

/** Busy hours a month above which owning beats renting at `rate` USD per GPU-hour, or null if it never does (even at 24/7). */
export function breakevenHours(gpu, rate, { count = 1 } = {}, own = DEFAULT_OWN, gpus = GPUS) {
  const fixed = ownCost(gpu, { count, busyHours: 0 }, own, gpus).depreciation;
  const n = Math.max(1, nn(count));
  const perHourSaved = nn(rate) * n - gpus[gpu].watts * n * nn(own.kwhUsd) / 1000;
  if (perHourSaved <= 0) return null;
  const h = fixed / perHourSaved;
  return h > HOURS_PER_MONTH ? null : round2(h);
}

/** 12-month spend per provider (and owning) as busy hours compound at `growthPct` a month. */
export function project(gpu, input, growthPct = 0, months = 12, providers = DEFAULT_PROVIDERS, own = DEFAULT_OWN) {
  const g = 1 + Math.max(-50, Number(growthPct) || 0) / 100;
  const path = [];
  for (let m = 0; m < months; m++) path.push(Math.min(HOURS_PER_MONTH * Math.max(1, nn(input.count)), Math.round(nn(input.busyHours) * g ** m)));
  const totals = [];
  for (const [key, p] of Object.entries(providers)) {
    if (p.rates?.[gpu] == null) continue;
    totals.push({ key, label: p.label, total: round2(path.reduce((n, h) => n + providerCost(p, gpu, { ...input, busyHours: h }), 0)) });
  }
  totals.push({ key: "own", label: `Buy and run ${GPUS[gpu].label}`, total: round2(path.reduce((n, h) => n + ownCost(gpu, { ...input, busyHours: h }, own).monthly, 0)) });
  totals.sort((a, b) => a.total - b.total || (a.label < b.label ? -1 : 1));
  return { path, endBusyHours: path[path.length - 1], totals };
}

/** Summary and budget gate. `budget` is monthly USD or null; applies to `provider` or else the cheapest. */
export function summarize(rows, { budget = null, provider = null } = {}) {
  if (!rows.length) return { status: "error", errors: 1, overBudget: false, text: "No provider offers that GPU." };
  const pick = provider ? rows.find((r) => r.key === provider) : rows[0];
  if (!pick) return { status: "error", errors: 1, overBudget: false, text: `Unknown provider "${provider}", or it does not offer that GPU.` };
  const overBudget = budget != null && pick.monthly > budget;
  let text = provider
    ? `${pick.label} is about ${fmt(pick.monthly)} per month (${fmt(pick.annual)} per year) for this workload.`
    : `Cheapest for this workload: ${pick.label}, about ${fmt(pick.monthly)} per month (${fmt(pick.annual)} per year).`;
  const worst = rows[rows.length - 1];
  if (worst.monthly > pick.monthly) text += ` The most expensive here, ${worst.label}, is ${fmt(worst.monthly)}.`;
  if (overBudget) text += ` Over your ${fmt(budget)} monthly budget by ${fmt(pick.monthly - budget)}.`;
  return { status: overBudget ? "error" : "ok", errors: overBudget ? 1 : 0, overBudget, text };
}

export function fmt(n) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
