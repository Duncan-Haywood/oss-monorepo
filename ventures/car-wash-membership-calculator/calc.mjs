// Unlimited-wash membership economics for a car wash. Pure functions, no DOM.
// Arithmetic on figures the user types; nothing here is a market price, a usage norm or a tax rule.

export const DEFAULTS = Object.freeze({
  membershipPrice: 30,
  retailPrice: 15,
  costPerWash: 2.5,
  cardFeePct: 3,
  members: 400,
  retailWashesPerMonth: 1500,
  overheadMonthly: 0,
  churnPct: 5,
  signupCost: 20,
  cannibalPct: 40,
  priorVisits: 1.5,
  washesPerHour: 60,
  hoursPerDay: 10,
  daysPerMonth: 30,
  priceStep: 5,
});

const num = (v, d = 0) => {
  if (v === "" || v === null || v === undefined) return d;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

// Lines: "segment, share of members (%), washes per member per month". Header optional.
export function parseSegments(text) {
  const rows = [];
  let skipped = 0;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const cells = (line.includes("\t") ? line.split("\t") : line.split(",")).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (cells.length < 3) { skipped++; continue; }
    const share = num(cells[1], NaN), washes = num(cells[2], NaN);
    if (!Number.isFinite(share) || !Number.isFinite(washes)) { if (rows.length || !/share|segment|washes|name/i.test(line)) skipped++; continue; }
    if (share <= 0 || share > 100 || washes < 0) { skipped++; continue; }
    rows.push({ name: cells[0] || "Segment", share, washes });
  }
  const warnings = skipped ? [`${skipped} line(s) skipped (need a name, a share above 0 up to 100, and washes per month of 0 or more).`] : [];
  if (!rows.length) return { error: "Add at least one line: segment, share of members (%), washes per member per month." };
  return { rows, warnings };
}

const clean = (opts) => {
  const o = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) if (opts && opts[k] !== undefined) o[k] = num(opts[k], DEFAULTS[k]);
  return o;
};

export function analyze(segments, opts = {}) {
  const o = clean(opts);
  for (const k of Object.keys(DEFAULTS)) if (!Number.isFinite(o[k]) || o[k] < 0) return { error: `Check the number in "${k}".` };
  if (o.membershipPrice <= 0) return { error: "Membership price must be above zero." };
  if (o.cardFeePct >= 100) return { error: "Card fee must be under 100%." };
  if (o.churnPct > 100) return { error: "Monthly churn must be 100% or less." };
  if (o.cannibalPct > 100) return { error: "Share of members who used to pay retail must be 100% or less." };
  if (o.washesPerHour <= 0 || o.hoursPerDay <= 0) return { error: "Washes per hour and hours open per day must be above zero." };
  if (o.daysPerMonth <= 0 || o.daysPerMonth > 31) return { error: "Days open per month must be between 1 and 31." };
  const warnings = [];
  const shareTotal = segments.reduce((a, s) => a + s.share, 0);
  if (Math.abs(shareTotal - 100) > 0.5) warnings.push(`Segment shares add to ${+shareTotal.toFixed(1)}%, not 100%; they were scaled to 100%.`);
  const fee = o.cardFeePct / 100;
  const netPrice = o.membershipPrice * (1 - fee);
  const retailNet = o.retailPrice * (1 - fee) - o.costPerWash;

  const segs = segments.map((s) => {
    const weight = s.share / shareTotal;
    const cost = s.washes * o.costPerWash;
    const margin = netPrice - cost;
    return {
      ...s, weight, cost, margin,
      retailValue: s.washes * o.retailPrice,
      impliedPerWash: s.washes > 0 ? o.membershipPrice / s.washes : null,
      losesMoney: margin < 0,
    };
  });
  const avgWashes = segs.reduce((a, s) => a + s.weight * s.washes, 0);
  const memberMargin = netPrice - avgWashes * o.costPerWash;
  const breakEvenWashes = o.costPerWash > 0 ? netPrice / o.costPerWash : null;
  const underwater = segs.filter((s) => s.losesMoney).reduce((a, s) => a + s.weight, 0);

  const memberContribution = o.members * memberMargin;
  const retailContribution = o.retailWashesPerMonth * retailNet;
  const contribution = memberContribution + retailContribution;
  const net = contribution - o.overheadMonthly;
  const converted = o.members * o.cannibalPct / 100;
  const lostRetail = converted * o.priorVisits * retailNet;
  const incremental = memberContribution - lostRetail;

  const breakEvenMembers = memberMargin > 0 ? Math.max(0, (o.overheadMonthly - retailContribution) / memberMargin) : null;
  const lifetimeMonths = o.churnPct > 0 ? 100 / o.churnPct : null;
  const lifetimeValue = lifetimeMonths !== null ? memberMargin * lifetimeMonths - o.signupCost : null;
  const paybackMonths = memberMargin > 0 ? o.signupCost / memberMargin : null;

  const capacity = o.washesPerHour * o.hoursPerDay * o.daysPerMonth;
  const memberWashes = o.members * avgWashes;
  const demand = memberWashes + o.retailWashesPerMonth;
  const utilization = demand / capacity;
  const maxMembers = avgWashes > 0 ? Math.max(0, (capacity - o.retailWashesPerMonth) / avgWashes) : null;

  if (memberMargin <= 0) warnings.push("The average member costs more in washes than the plan brings in, so more members lose more.");
  if (underwater > 0 && memberMargin > 0) warnings.push(`${pct(underwater, 0)} of members wash enough to lose money on the plan; the average hides them.`);
  if (utilization > 1) warnings.push(`Member and retail washes need ${pct(utilization, 0)} of your tunnel capacity; they do not fit at these hours.`);
  if (o.costPerWash === 0) warnings.push("Cost per wash is zero, so every wash is treated as free; enter chemicals, water, power and wash-line labor per car.");
  if (incremental < 0 && memberMargin > 0) warnings.push("After the retail washes the converted members used to pay for, the plan adds less than it removes at these figures.");

  // Price sensitivity: same members and same usage at each price. Demand response is not modelled.
  const prices = [];
  for (let k = -2; k <= 2; k++) {
    const p = o.membershipPrice + k * o.priceStep;
    if (p <= 0) continue;
    const m = p * (1 - fee) - avgWashes * o.costPerWash;
    const holdMembers = m > 0 && memberMargin > 0 ? (o.members * memberMargin) / m : null;
    prices.push({
      price: p, step: k, margin: m, monthlyChange: o.members * (m - memberMargin),
      membersToHold: holdMembers, memberChangePct: holdMembers === null ? null : holdMembers / o.members - 1,
      breakEvenWashes: o.costPerWash > 0 ? p * (1 - fee) / o.costPerWash : null,
    });
  }

  const verdict = memberMargin <= 0
    ? "The average member loses money on the plan at these figures."
    : `The average member nets ${money2(memberMargin)} a month and the plan loses money past ${breakEvenWashes === null ? "any number of" : breakEvenWashes.toFixed(1)} washes. ${lifetimeValue === null ? "With no churn entered the lifetime is unbounded." : `At ${o.churnPct}% churn a member is worth ${money(lifetimeValue)} over about ${lifetimeMonths.toFixed(0)} months after signup cost.`}`;

  return {
    options: o, segments: segs, verdict, warnings, prices,
    member: { netPrice, avgWashes, cost: avgWashes * o.costPerWash, margin: memberMargin, breakEvenWashes, underwater, retailNet, lifetimeMonths, lifetimeValue, paybackMonths },
    store: { memberContribution, retailContribution, contribution, overhead: o.overheadMonthly, net, annual: net * 12, converted, lostRetail, incremental, breakEvenMembers, capacity, memberWashes, demand, utilization, maxMembers },
  };
}

export function sampleSegments() {
  return "segment,share of members %,washes per month\nLight (rarely washes),40,1\nTypical,40,3\nHeavy,15,8\nVery heavy,5,14";
}

const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : "");
export function reportCsv(r) {
  const out = [["Segment", "Share %", "Washes per month", "Plan cost per member", "Net per member", "Retail value of washes"]];
  for (const s of r.segments) out.push([s.name, f2(s.weight * 100), f2(s.washes), f2(s.cost), f2(s.margin), f2(s.retailValue)]);
  out.push([]);
  out.push(["Price", "Net per member", "Monthly change at same members", "Members to hold contribution", "Break-even washes"]);
  for (const p of r.prices) out.push([f2(p.price), f2(p.margin), f2(p.monthlyChange), p.membersToHold === null ? "" : f2(p.membersToHold), p.breakEvenWashes === null ? "" : f2(p.breakEvenWashes)]);
  out.push([]);
  out.push(["Per month", "Member contribution", "Retail contribution", "Overhead", "Net", "Capacity used %"]);
  out.push(["", f2(r.store.memberContribution), f2(r.store.retailContribution), f2(r.store.overhead), f2(r.store.net), f2(r.store.utilization * 100)]);
  const q = (c) => { const s = String(c); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return out.map((row) => row.map(q).join(",")).join("\n") + "\n";
}

export const money = (v) => (v < 0 ? "-$" : "$") + Math.round(Math.abs(v)).toLocaleString("en-US");
export const money2 = (v) => (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const pct = (v, d = 1) => (v * 100).toFixed(d) + "%";
