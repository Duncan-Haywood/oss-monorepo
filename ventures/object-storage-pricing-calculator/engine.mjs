// Zero-dependency, deterministic comparison of what object-storage providers charge for a
// stored volume (GB at rest) and a monthly egress volume (GB downloaded), so a founder can
// see the bill at today's size, the 12-month spend under a growth rate, and the egress level
// at which the cheapest provider changes. Pure data in, report out -- no filesystem or
// network here (cli.mjs and index.html supply the input).
//
// This is arithmetic on two typed volumes and editable rate cards. It is not a quote and not
// a guarantee: the real invoice also depends on request/operation fees, minimum object
// durations, early-deletion charges, regions, replication, support plans, contracts and each
// provider's fair-use terms, none of which this file reproduces.

export const PRICES_AS_OF = "approximate public list prices as best known in 2025 for the main US/EU region -- providers change packaging often; verify each at its own pricing page";

// Editable. Monthly cost of a provider =
//   baseUsd
// + max(0, max(storedGb, minBilledStorageGb) - includedStorageGb) * storagePerGb
// + max(0, egressGb - includedEgressGb - egressFreeRatio * storedGb) * egressPerGb
export const DEFAULT_PROVIDERS = {
  s3: { label: "Amazon S3 Standard (us-east-1)", url: "https://aws.amazon.com/s3/pricing/", baseUsd: 0, includedStorageGb: 0, minBilledStorageGb: 0, storagePerGb: 0.023, includedEgressGb: 100, egressFreeRatio: 0, egressPerGb: 0.09 },
  r2: { label: "Cloudflare R2 (Standard)", url: "https://developers.cloudflare.com/r2/pricing/", baseUsd: 0, includedStorageGb: 10, minBilledStorageGb: 0, storagePerGb: 0.015, includedEgressGb: 0, egressFreeRatio: 0, egressPerGb: 0 },
  b2: { label: "Backblaze B2 (egress free up to 3x stored)", url: "https://www.backblaze.com/cloud-storage/pricing", baseUsd: 0, includedStorageGb: 10, minBilledStorageGb: 0, storagePerGb: 0.006, includedEgressGb: 0, egressFreeRatio: 3, egressPerGb: 0.01 },
  wasabi: { label: "Wasabi (1 TB minimum, egress free up to stored)", url: "https://wasabi.com/pricing", baseUsd: 0, includedStorageGb: 0, minBilledStorageGb: 1000, storagePerGb: 0.0069, includedEgressGb: 0, egressFreeRatio: 1, egressPerGb: 0.0069 },
  spaces: { label: "DigitalOcean Spaces ($5 incl. 250 GB + 1 TB egress)", url: "https://www.digitalocean.com/pricing/spaces-object-storage", baseUsd: 5, includedStorageGb: 250, minBilledStorageGb: 0, storagePerGb: 0.02, includedEgressGb: 1000, egressFreeRatio: 0, egressPerGb: 0.01 },
  hetzner: { label: "Hetzner Object Storage (base incl. 1 TB + 1 TB egress)", url: "https://www.hetzner.com/storage/object-storage/", baseUsd: 5.5, includedStorageGb: 1000, minBilledStorageGb: 0, storagePerGb: 0.006, includedEgressGb: 1000, egressFreeRatio: 0, egressPerGb: 0.0012 },
};

const round2 = (n) => Math.round(n * 100) / 100;
const nn = (n) => Math.max(0, Number(n) || 0);

/** Monthly cost of one provider at `storedGb` at rest and `egressGb` downloaded. */
export function providerCost(p, storedIn, egressIn) {
  const stored = nn(storedIn), egress = nn(egressIn);
  if (stored === 0 && egress === 0) return 0;
  const billedStorage = Math.max(stored, nn(p.minBilledStorageGb));
  const storage = Math.max(0, billedStorage - nn(p.includedStorageGb)) * nn(p.storagePerGb);
  const freeEgress = nn(p.includedEgressGb) + nn(p.egressFreeRatio) * stored;
  const out = Math.max(0, egress - freeEgress) * nn(p.egressPerGb);
  return round2(nn(p.baseUsd) + storage + out);
}

/** Every provider priced at the volumes, cheapest first (ties by label). */
export function compare(storedGb, egressGb, providers = DEFAULT_PROVIDERS) {
  const rows = Object.entries(providers).map(([key, p]) => {
    const monthly = providerCost(p, storedGb, egressGb);
    return { key, label: p.label, url: p.url, monthly, annual: round2(monthly * 12) };
  });
  rows.sort((a, b) => a.monthly - b.monthly || (a.label < b.label ? -1 : 1));
  const cheapest = rows[0].monthly;
  return rows.map((r) => ({ ...r, extraVsCheapest: round2(r.monthly - cheapest) }));
}

/** Month-by-month volumes under compound growth (both stored and egress) and each provider's total over `months`. */
export function project(storedGb, egressGb, growthPct = 0, months = 12, providers = DEFAULT_PROVIDERS) {
  const g = 1 + Math.max(-50, Number(growthPct) || 0) / 100;
  const path = [];
  for (let m = 0; m < months; m++) path.push({ stored: Math.round(nn(storedGb) * g ** m), egress: Math.round(nn(egressGb) * g ** m) });
  const end = path[path.length - 1];
  const totals = Object.entries(providers).map(([key, p]) => ({
    key, label: p.label, total: round2(path.reduce((n, x) => n + providerCost(p, x.stored, x.egress), 0)), endMonthly: providerCost(p, end.stored, end.egress),
  }));
  totals.sort((a, b) => a.total - b.total || (a.label < b.label ? -1 : 1));
  return { path, endStored: end.stored, endEgress: end.egress, totals };
}

/** Which provider is cheapest as monthly egress grows (at fixed stored GB), as segments `{from, to, key, label}`. */
export function cheapestSegments(storedGb, providers = DEFAULT_PROVIDERS, maxEgress = 500000) {
  const winner = (v) => {
    const rows = compare(storedGb, v, providers);
    const tied = rows.filter((r) => r.monthly === rows[0].monthly);
    return { key: tied.map((r) => r.key).join("+"), label: tied.length > 1 ? `${tied.map((r) => r.label).join(", ")} (all ${fmt(rows[0].monthly)})` : rows[0].label };
  };
  const grid = [0];
  for (let v = 1; v < maxEgress; v = Math.ceil(v * 1.03)) grid.push(v);
  grid.push(maxEgress);
  const segs = [];
  let prev = winner(grid[0]);
  let start = 0;
  for (let i = 1; i < grid.length; i++) {
    const w = winner(grid[i]);
    if (w.key === prev.key) continue;
    let lo = grid[i - 1], hi = grid[i];
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (winner(mid).key === prev.key) lo = mid; else hi = mid; }
    segs.push({ from: start, to: lo, key: prev.key, label: prev.label });
    start = hi;
    prev = w;
  }
  segs.push({ from: start, to: maxEgress, key: prev.key, label: prev.label });
  return segs;
}

/** Summary and budget gate. `budget` is monthly USD or null; applies to `provider` or else the cheapest. */
export function summarize(rows, { budget = null, provider = null } = {}) {
  const pick = provider ? rows.find((r) => r.key === provider) : rows[0];
  if (!pick) return { status: "error", errors: 1, overBudget: false, text: `Unknown provider "${provider}".` };
  const overBudget = budget != null && pick.monthly > budget;
  let text = provider
    ? `${pick.label} is about ${fmt(pick.monthly)} per month (${fmt(pick.annual)} per year) at these volumes.`
    : `Cheapest at these volumes: ${pick.label}, about ${fmt(pick.monthly)} per month (${fmt(pick.annual)} per year).`;
  const worst = rows[rows.length - 1];
  if (worst.monthly > pick.monthly) text += ` The most expensive here, ${worst.label}, is ${fmt(worst.monthly)}.`;
  if (overBudget) text += ` Over your ${fmt(budget)} monthly budget by ${fmt(pick.monthly - budget)}.`;
  return { status: overBudget ? "error" : "ok", errors: overBudget ? 1 : 0, overBudget, text };
}

export function fmt(n) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
