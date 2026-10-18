// Music distributor cost comparison. No network, no state.
//
// An independent artist pays a distributor (DistroKid, TuneCore, CD Baby, ...)
// in up to three ways: a yearly plan fee, a per-release fee, and a percentage
// cut of the royalties. Each distributor's pricing page quotes only its own
// scheme, so the real question -- which one leaves the most in my pocket for
// MY release count and MY stream volume, and where does the answer flip --
// is never answered side by side. Cost is linear in royalties, so the flip is
// a single streams-per-month number.
//
// Pricing changes often, so the presets are starting points to be checked on
// each distributor's pricing page, never facts this file vouches for.

function number(value, name, { min = 0, max = null } = {}) {
  if (value === "" || value === null || value === undefined) throw new Error(`${name} is required`);
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (max !== null && result > max) throw new Error(`${name} must be at most ${max}`);
  return result;
}

/**
 * Starting-point schemes, USD. Approximate, from general knowledge, NOT checked
 * against a live pricing page: the page says so and every number is editable.
 * planFee = per year; releaseFee = per new release in the year;
 * commissionPercent = share of royalties the distributor keeps.
 */
export const PRESETS = [
  { id: "distrokid", name: "DistroKid (Musician)", planFee: 24.99, releaseFee: 0, commissionPercent: 0, note: "Flat yearly plan, unlimited releases, keeps no cut." },
  { id: "tunecore", name: "TuneCore (paid plan)", planFee: 14.99, releaseFee: 0, commissionPercent: 0, note: "Per-year plan; higher tiers add features. Check the current tier." },
  { id: "cdbaby", name: "CD Baby (per release)", planFee: 0, releaseFee: 9.99, commissionPercent: 9, note: "One fee per single plus a cut of royalties." },
  { id: "amuse-free", name: "Amuse (free tier)", planFee: 0, releaseFee: 0, commissionPercent: 0, note: "Free tier; fewer features and slower or limited release options." },
  { id: "routenote-free", name: "RouteNote (free)", planFee: 0, releaseFee: 0, commissionPercent: 15, note: "No upfront cost, keeps a share of royalties." },
  { id: "unitedmasters", name: "UnitedMasters (free)", planFee: 0, releaseFee: 0, commissionPercent: 10, note: "Free plan with a revenue share." },
];

export const DEFAULT_PAYOUT_PER_STREAM = 0.0035;
export const VOLUME_LADDER = [1000, 5000, 10000, 25000, 50000, 100000, 250000, 1000000];

function cleanDistributor(d, i) {
  const label = `Distributor ${i + 1}`;
  return {
    name: String(d.name || "").trim() || label,
    planFee: number(d.planFee, `${label} yearly fee`),
    releaseFee: number(d.releaseFee, `${label} fee per release`),
    commissionPercent: number(d.commissionPercent, `${label} royalty cut %`, { max: 100 }),
  };
}

function evaluate(d, { royalties, releases }) {
  const cut = royalties * (d.commissionPercent / 100);
  const fees = d.planFee + d.releaseFee * releases;
  const totalCost = fees + cut;
  return {
    name: d.name,
    royalties,
    fees,
    cut,
    totalCost,
    net: royalties - totalCost,
    costPercentOfRoyalties: royalties === 0 ? null : (totalCost / royalties) * 100,
  };
}

/**
 * Yearly royalties at which distributors `a` and `b` cost the same, or null if
 * the lines never cross at a positive amount.
 */
export function crossoverRoyalties(a, b, { releases }) {
  const fa = a.planFee + a.releaseFee * releases;
  const fb = b.planFee + b.releaseFee * releases;
  const ca = a.commissionPercent / 100;
  const cb = b.commissionPercent / 100;
  if (ca === cb) return null;
  const r = (fb - fa) / (ca - cb);
  return Number.isFinite(r) && r > 0 ? r : null;
}

export function compareDistributors(input) {
  let streams, payout, releases, ds;
  try {
    streams = number(input.streamsPerMonth, "Streams per month");
    payout = number(input.payoutPerStream ?? DEFAULT_PAYOUT_PER_STREAM, "Payout per stream");
    releases = number(input.releasesPerYear, "Releases per year");
    if (!Array.isArray(input.distributors) || input.distributors.length < 2) throw new Error("Add at least two distributors to compare");
    ds = input.distributors.map(cleanDistributor);
  } catch (e) {
    return { error: e.message };
  }
  if (payout <= 0) return { error: "Payout per stream must be greater than zero" };

  const royalties = streams * payout * 12;
  const rows = ds.map((d) => evaluate(d, { royalties, releases })).sort((a, b) => b.net - a.net);
  const best = rows[0];
  const worst = rows[rows.length - 1];

  const ladder = VOLUME_LADDER.map((n) => {
    const at = ds.map((d) => evaluate(d, { royalties: n * payout * 12, releases })).sort((a, b) => b.net - a.net);
    return { streams: n, winner: at[0].name, net: at[0].net };
  });

  const crossings = [];
  for (let i = 0; i < ds.length; i++) {
    for (let j = i + 1; j < ds.length; j++) {
      const r = crossoverRoyalties(ds[i], ds[j], { releases });
      if (r !== null) {
        const iHigherCut = ds[i].commissionPercent > ds[j].commissionPercent;
        crossings.push({
          a: ds[i].name, b: ds[j].name, streamsPerMonth: r / (payout * 12),
          // below the crossover the lower-fixed-cost (higher-cut) plan is cheaper
          cheaperBelow: iHigherCut ? ds[i].name : ds[j].name,
          cheaperAbove: iHigherCut ? ds[j].name : ds[i].name,
        });
      }
    }
  }

  const findings = [];
  const spread = best.net - worst.net;
  findings.push({
    severity: spread > 0 ? "high" : "info",
    title: `${best.name} leaves you the most at ${Math.round(streams).toLocaleString("en-US")} streams a month`,
    detail: `About ${best.net.toFixed(2)} a year against ${worst.net.toFixed(2)} on ${worst.name}, a gap of roughly ${spread.toFixed(0)} a year.`,
  });
  const relevant = crossings
    .filter((c) => c.a === best.name || c.b === best.name)
    .sort((x, y) => Math.abs(x.streamsPerMonth - streams) - Math.abs(y.streamsPerMonth - streams))[0];
  if (relevant) {
    findings.push({
      severity: "medium",
      title: `The ranking flips near ${Math.round(relevant.streamsPerMonth).toLocaleString("en-US")} streams a month`,
      detail: `Below that, ${relevant.cheaperBelow} costs less than ${relevant.cheaperAbove}; above it, ${relevant.cheaperAbove} does. If your catalogue is growing, price the plan you will be on, not the one you are on.`,
    });
  }
  if (royalties < 100) {
    findings.push({
      severity: "medium",
      title: "At this volume a flat yearly fee can exceed your whole royalty income",
      detail: "Under a few hundred dollars of yearly royalties, a revenue-share or free tier usually costs less than a yearly plan.",
    });
  }
  findings.push({
    severity: "info",
    title: "Check each scheme before you rely on this",
    detail: "Pricing and per-stream rates change often and vary by service and country. The presets are approximate; confirm each on the distributor's pricing page and edit it here. Features, payout speed and takedown terms are not compared.",
  });

  return { streams, payout, releases, royalties, rows, best, worst, ladder, crossings, findings };
}

export function money(n) {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
