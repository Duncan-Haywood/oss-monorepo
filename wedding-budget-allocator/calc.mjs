// Wedding budget allocator: splits a total budget across categories using
// per-guest and fixed cost drivers, a region multiplier, a season multiplier
// and up to three "this matters most" priorities. Pure functions, no DOM.
//
// Baselines are mid-cost-region US ballpark figures (rules of thumb, not
// quotes) and are the thing to overwrite with real vendor quotes.
//
//   need[c]   = base[c] x regionMult x (seasonMult if seasonal) x (guests if per-guest)
//   spendable = budget x (1 - contingency)
//   alloc[c]  = water-filled so sum(alloc) = spendable, each category held
//               inside [FLOOR x need, CAP x need]; priority categories carry
//               a heavier weight so they absorb more of any surplus and lose
//               less in a shortfall.

export const REGIONS = {
  low: { label: "Lower-cost region", mult: 0.75 },
  mid: { label: "Mid-cost region", mult: 1 },
  high: { label: "High-cost metro", mult: 1.3 },
  veryhigh: { label: "Very high-cost metro", mult: 1.7 },
};
export const SEASONS = {
  off: { label: "Off-peak (Jan-Mar, weekday)", mult: 0.88 },
  standard: { label: "Standard", mult: 1 },
  peak: { label: "Peak (May-Oct Saturday)", mult: 1.12 },
};

export const CATEGORIES = [
  { key: "venue", label: "Venue rental", base: 4500, perGuest: false, seasonal: true },
  { key: "catering", label: "Food and service", base: 85, perGuest: true, seasonal: true },
  { key: "bar", label: "Bar and drinks", base: 30, perGuest: true, seasonal: false },
  { key: "photo", label: "Photography", base: 3200, perGuest: false, seasonal: false },
  { key: "video", label: "Videography", base: 1800, perGuest: false, seasonal: false },
  { key: "music", label: "Music and DJ", base: 1600, perGuest: false, seasonal: false },
  { key: "florals", label: "Flowers and decor", base: 2600, perGuest: false, seasonal: true },
  { key: "attire", label: "Attire, hair and makeup", base: 2400, perGuest: false, seasonal: false },
  { key: "rentals", label: "Rentals (tables, chairs, linens)", base: 12, perGuest: true, seasonal: false },
  { key: "cake", label: "Cake and desserts", base: 6, perGuest: true, seasonal: false },
  { key: "stationery", label: "Invitations and stationery", base: 5, perGuest: true, seasonal: false },
  { key: "planner", label: "Planner or day-of coordinator", base: 1600, perGuest: false, seasonal: false },
  { key: "officiant", label: "Officiant and license", base: 450, perGuest: false, seasonal: false },
  { key: "transport", label: "Transportation", base: 700, perGuest: false, seasonal: false },
];

export const CONTINGENCY = 0.07;
export const FLOOR = 0.45;
export const CAP = 1.6;
const PRIORITY_WEIGHT = 1.35;

export function money(n) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

export function needs({ guests, region, season }) {
  const r = REGIONS[region].mult;
  const s = SEASONS[season].mult;
  return CATEGORIES.map((c) => ({
    ...c,
    need: c.base * r * (c.seasonal ? s : 1) * (c.perGuest ? guests : 1),
  }));
}

export function fitBand(ratio) {
  if (ratio < 0.6) return "very tight";
  if (ratio < 0.85) return "tight";
  if (ratio <= 1.2) return "realistic";
  return "comfortable";
}

function ratioFor(budget, guests, region, season) {
  const total = needs({ guests, region, season }).reduce((a, c) => a + c.need, 0);
  return (budget * (1 - CONTINGENCY)) / total;
}

// Largest guest count (<= current) at which the budget reaches the "realistic"
// threshold of 0.85 of typical cost. Null when even 1 guest does not.
export function guestsForRealistic(budget, guests, region, season) {
  if (ratioFor(budget, guests, region, season) >= 0.85) return guests;
  let lo = 1, hi = guests, best = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (ratioFor(budget, mid, region, season) >= 0.85) { best = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return best;
}

export function allocate(items, spendable, priorities) {
  const rows = items.map((c) => ({
    ...c,
    weight: priorities.includes(c.key) ? PRIORITY_WEIGHT : 1,
    lo: c.need * FLOOR,
    hi: c.need * CAP,
    alloc: 0,
    fixed: false,
  }));
  let remaining = spendable;
  // Budget below even the floors: no category can hold its floor, so split
  // pro rata by weighted need instead of overspending.
  if (rows.reduce((a, r) => a + r.lo, 0) > spendable) {
    const wsum = rows.reduce((a, r) => a + r.weight * r.need, 0);
    for (const r of rows) r.alloc = (spendable * r.weight * r.need) / wsum;
    return rows;
  }
  for (let pass = 0; pass < 30; pass++) {
    const free = rows.filter((r) => !r.fixed);
    if (!free.length) break;
    const wsum = free.reduce((a, r) => a + r.weight * r.need, 0);
    let clamped = false;
    for (const r of free) {
      const share = (remaining * r.weight * r.need) / wsum;
      if (share < r.lo) { r.alloc = r.lo; r.fixed = true; clamped = true; }
      else if (share > r.hi) { r.alloc = r.hi; r.fixed = true; clamped = true; }
      else r.alloc = share;
    }
    if (!clamped) break;
    remaining = spendable - rows.filter((r) => r.fixed).reduce((a, r) => a + r.alloc, 0);
    if (remaining < 0) remaining = 0;
  }
  return rows;
}

export function weddingPlan(input) {
  const { budget, guests, region = "mid", season = "standard" } = input ?? {};
  const priorities = Array.isArray(input?.priorities) ? input.priorities.slice(0, 3) : [];
  if (!isNum(budget) || budget <= 0) return { invalid: "Enter your total wedding budget in dollars." };
  if (!isNum(guests) || guests < 1 || !Number.isInteger(guests)) return { invalid: "Enter a whole number of guests, 1 or more." };
  if (!REGIONS[region]) return { invalid: "Pick a region." };
  if (!SEASONS[season]) return { invalid: "Pick a season." };
  const keys = new Set(CATEGORIES.map((c) => c.key));
  if (priorities.some((p) => !keys.has(p))) return { invalid: "Unknown priority category." };

  const items = needs({ guests, region, season });
  const typical = items.reduce((a, c) => a + c.need, 0);
  const contingency = budget * CONTINGENCY;
  const spendable = budget - contingency;
  const ratio = spendable / typical;
  const rows = allocate(items, spendable, priorities);
  const allocated = rows.reduce((a, r) => a + r.alloc, 0);
  const cushion = Math.max(0, spendable - allocated);

  const findings = [];
  const band = fitBand(ratio);
  if (band === "very tight" || band === "tight") {
    const g = guestsForRealistic(budget, guests, region, season);
    findings.push({
      severity: band === "very tight" ? "high" : "medium",
      title: `Budget covers ${(ratio * 100).toFixed(0)}% of typical cost for ${guests} guests`,
      detail: g === null
        ? "Even a very small guest list does not reach typical vendor costs in this region and season. Expect to cut scope hard: DIY, a venue that includes catering, or a weekday date."
        : `Trimming to about ${g} guests would bring the budget to a realistic level (85% of typical cost) without cutting categories. Alternatives: an off-peak date, or a venue that bundles catering and rentals.`,
    });
  }
  for (const r of rows) {
    if (r.alloc < r.need * 0.6) {
      findings.push({
        severity: "info",
        title: `${r.label}: ${money(r.alloc)} is under 60% of the typical ${money(r.need)}`,
        detail: "Plan a cheaper route for this line (smaller scope, DIY, a friend's skill, a package) or move money from a lower-priority category.",
      });
    }
  }
  const pg = rows.filter((r) => r.perGuest).reduce((a, r) => a + r.alloc, 0);
  findings.push({
    severity: "info",
    title: `Each extra guest costs about ${money(pg / guests)}`,
    detail: `That is the per-guest part of this plan (food, bar, rentals, cake, stationery). Ten more guests adds about ${money((pg / guests) * 10)} and does not change the fixed lines.`,
  });
  if (cushion > 0) {
    findings.push({
      severity: "info",
      title: `${money(cushion)} is unallocated after every category reaches its cap`,
      detail: "Raise a priority, add a line (honeymoon, rehearsal dinner, welcome party), or keep it as extra contingency.",
    });
  }

  return { budget, guests, region, season, typical, contingency, spendable, ratio, band, rows, allocated, cushion, perGuest: pg / guests, findings };
}
