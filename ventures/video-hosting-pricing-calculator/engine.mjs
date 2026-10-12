// Zero-dependency, deterministic comparison of what video-hosting platforms charge for a
// library (minutes stored), monthly viewing (minutes delivered) and monthly new uploads
// (minutes encoded), so a creator-tool founder or course seller can see the bill at today's
// size, the 12-month spend under a growth rate, and the viewing level where the cheapest
// platform changes. Pure data in, report out -- no filesystem or network here (cli.mjs and
// index.html supply the input).
//
// This is arithmetic on three typed volumes and editable rate cards. It is not a quote and not
// a guarantee: real invoices also depend on resolution ladders, live streaming, DRM, captions,
// minimum commitments, bandwidth-to-minutes assumptions, regions and contracts, none of which
// this file reproduces.

export const PRICES_AS_OF = "approximate public list prices as best known in 2025 for 720p-1080p on-demand video -- platforms change packaging often; verify each at its own pricing page";

// Editable. Monthly cost of a platform =
//   baseUsd
// + max(0, storedMin - includedStorageMin) * storagePerMin
// + max(0, deliveredMin - includedDeliveryMin) * deliveryPerMin
// + encodedMin * encodePerMin
// Per-GB providers (Bunny, CloudFront) are converted at about 0.02 GB stored and 0.019 GB
// delivered per minute (roughly 2.5 Mbps), which is why their per-minute rates look odd.
export const DEFAULT_PROVIDERS = {
  cfstream: { label: "Cloudflare Stream ($5/1,000 min stored, $1/1,000 min delivered)", url: "https://developers.cloudflare.com/stream/pricing/", baseUsd: 0, storagePerMin: 0.005, includedStorageMin: 0, deliveryPerMin: 0.001, includedDeliveryMin: 0, encodePerMin: 0 },
  mux: { label: "Mux Video (basic quality, 100,000 delivery min free)", url: "https://www.mux.com/pricing", baseUsd: 0, storagePerMin: 0.0024, includedStorageMin: 0, deliveryPerMin: 0.0008, includedDeliveryMin: 100000, encodePerMin: 0 },
  bunny: { label: "Bunny Stream ($1 minimum, billed by GB)", url: "https://bunny.net/pricing/stream/", baseUsd: 1, storagePerMin: 0.0002, includedStorageMin: 0, deliveryPerMin: 0.00019, includedDeliveryMin: 0, encodePerMin: 0 },
  apivideo: { label: "api.video (pay as you go)", url: "https://api.video/pricing/", baseUsd: 0, storagePerMin: 0.00285, includedStorageMin: 0, deliveryPerMin: 0.0017, includedDeliveryMin: 0, encodePerMin: 0 },
  diy: { label: "DIY: AWS MediaConvert + S3 + CloudFront (1 TB free delivery)", url: "https://aws.amazon.com/mediaconvert/pricing/", baseUsd: 0, storagePerMin: 0.00046, includedStorageMin: 0, deliveryPerMin: 0.0016, includedDeliveryMin: 52000, encodePerMin: 0.0075 },
};

const round2 = (n) => Math.round(n * 100) / 100;
const nn = (n) => Math.max(0, Number(n) || 0);

/** Monthly cost of one platform with `storedIn` minutes at rest, `deliveredIn` watched and `encodedIn` newly uploaded. */
export function providerCost(p, storedIn, deliveredIn, encodedIn = 0) {
  const stored = nn(storedIn), delivered = nn(deliveredIn), encoded = nn(encodedIn);
  if (stored === 0 && delivered === 0 && encoded === 0) return 0;
  const storage = Math.max(0, stored - nn(p.includedStorageMin)) * nn(p.storagePerMin);
  const delivery = Math.max(0, delivered - nn(p.includedDeliveryMin)) * nn(p.deliveryPerMin);
  return round2(nn(p.baseUsd) + storage + delivery + encoded * nn(p.encodePerMin));
}

/** Every platform priced at the volumes, cheapest first (ties by label). */
export function compare(storedMin, deliveredMin, encodedMin = 0, providers = DEFAULT_PROVIDERS) {
  const rows = Object.entries(providers).map(([key, p]) => {
    const monthly = providerCost(p, storedMin, deliveredMin, encodedMin);
    return { key, label: p.label, url: p.url, monthly, annual: round2(monthly * 12) };
  });
  rows.sort((a, b) => a.monthly - b.monthly || (a.label < b.label ? -1 : 1));
  const cheapest = rows[0].monthly;
  return rows.map((r) => ({ ...r, extraVsCheapest: round2(r.monthly - cheapest) }));
}

/** Month-by-month volumes under compound growth (all three volumes) and each platform's total over `months`. */
export function project(storedMin, deliveredMin, encodedMin = 0, growthPct = 0, months = 12, providers = DEFAULT_PROVIDERS) {
  const g = 1 + Math.max(-50, Number(growthPct) || 0) / 100;
  const path = [];
  for (let m = 0; m < months; m++) path.push({ stored: Math.round(nn(storedMin) * g ** m), delivered: Math.round(nn(deliveredMin) * g ** m), encoded: Math.round(nn(encodedMin) * g ** m) });
  const end = path[path.length - 1];
  const totals = Object.entries(providers).map(([key, p]) => ({
    key, label: p.label, total: round2(path.reduce((n, x) => n + providerCost(p, x.stored, x.delivered, x.encoded), 0)), endMonthly: providerCost(p, end.stored, end.delivered, end.encoded),
  }));
  totals.sort((a, b) => a.total - b.total || (a.label < b.label ? -1 : 1));
  return { path, endStored: end.stored, endDelivered: end.delivered, endEncoded: end.encoded, totals };
}

/** Which platform is cheapest as monthly minutes delivered grow (at fixed stored/encoded minutes), as segments `{from, to, key, label}`. */
export function cheapestSegments(storedMin, encodedMin = 0, providers = DEFAULT_PROVIDERS, maxDelivered = 50000000) {
  const winner = (v) => {
    const rows = compare(storedMin, v, encodedMin, providers);
    const tied = rows.filter((r) => r.monthly === rows[0].monthly);
    return { key: tied.map((r) => r.key).join("+"), label: tied.length > 1 ? `${tied.map((r) => r.label).join(", ")} (all ${fmt(rows[0].monthly)})` : rows[0].label };
  };
  const grid = [0];
  for (let v = 1; v < maxDelivered; v = Math.ceil(v * 1.03)) grid.push(v);
  grid.push(maxDelivered);
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
  segs.push({ from: start, to: maxDelivered, key: prev.key, label: prev.label });
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
