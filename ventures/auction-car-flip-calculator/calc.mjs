// Max bid, profit and stress test for flipping an auction vehicle. Pure functions, no DOM.
// Arithmetic on figures the user types; nothing here is an auction fee schedule, a tax rate or a market value.

export const DEFAULTS = Object.freeze({
  resale: 0,
  flatFees: 0,
  transport: 0,
  titleFees: 0,
  taxRatePct: 0,
  taxBase: "bid-and-fees",
  holdingDays: 30,
  holdingPerDay: 0,
  aprPct: 0,
  sellPct: 0,
  sellFixed: 0,
  targetProfit: 1000,
  targetPct: 0,
  overrunPct: 0,
});

const num = (v, d = 0) => {
  if (v === "" || v === null || v === undefined) return d;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

// Repair lines: "item, cost" (or "item<TAB>cost"); a bare number is also accepted.
export function parseRepairs(text) {
  const rows = [];
  let skipped = 0;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const cells = (line.includes("\t") ? line.split("\t") : line.split(",")).map((c) => c.trim().replace(/^"|"$/g, ""));
    const costCell = cells.length === 1 ? cells[0] : cells[cells.length - 1];
    const cost = num(costCell, NaN);
    if (!Number.isFinite(cost) || cost < 0) { if (rows.length || !/item|repair|cost|part/i.test(line)) skipped++; continue; }
    rows.push({ name: cells.length === 1 ? "Repair" : cells.slice(0, -1).join(", ") || "Repair", cost });
  }
  const warnings = skipped ? [`${skipped} repair line(s) skipped (each needs a cost of zero or more).`] : [];
  return { rows, total: rows.reduce((a, r) => a + r.cost, 0), warnings };
}

// Buyer-fee tiers: "bid up to, fee" where fee is dollars or ends in %. Example: "499.99, 60" / "1999.99, 8%".
// The first tier whose limit is at or above the bid applies; above the last limit the last tier applies.
export function parseFeeTiers(text) {
  const tiers = [];
  let skipped = 0;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const cells = (line.includes("\t") ? line.split("\t") : line.split(",")).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (cells.length < 2) { skipped++; continue; }
    const upTo = num(cells[0], NaN), feeCell = cells[1], pctFee = /%\s*$/.test(feeCell), fee = num(feeCell, NaN);
    if (!Number.isFinite(upTo) || !Number.isFinite(fee) || upTo < 0 || fee < 0 || (pctFee && fee >= 100)) { if (tiers.length || !/up ?to|bid|limit|fee/i.test(line)) skipped++; continue; }
    tiers.push({ upTo, fee, pct: pctFee });
  }
  tiers.sort((a, b) => a.upTo - b.upTo);
  const warnings = skipped ? [`${skipped} fee tier line(s) skipped (need "bid up to, fee" with the fee in dollars or %).`] : [];
  return { tiers, warnings };
}

export function buyerFee(bid, tiers) {
  if (!tiers || !tiers.length || bid <= 0) return 0;
  const t = tiers.find((x) => bid <= x.upTo + 1e-9) || tiers[tiers.length - 1];
  return t.pct ? (bid * t.fee) / 100 : t.fee;
}

const clean = (opts) => {
  const o = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) {
    if (opts && opts[k] !== undefined) o[k] = k === "taxBase" ? String(opts[k]) : num(opts[k], DEFAULTS[k]);
  }
  return o;
};

function validate(o) {
  for (const k of Object.keys(DEFAULTS)) {
    if (k === "taxBase") continue;
    if (!Number.isFinite(o[k]) || o[k] < 0) return `Check the number in "${k}".`;
  }
  if (!(o.resale > 0)) return "Enter the expected resale price (above zero).";
  if (!["bid", "bid-and-fees", "none"].includes(o.taxBase)) return "Choose what sales tax applies to.";
  if (o.taxRatePct >= 100 || o.sellPct >= 100 || o.targetPct >= 100) return "Percentages must be under 100%.";
  if (o.holdingDays > 3650) return "Days held looks too large; enter days between 0 and 3650.";
  return null;
}

// Everything the buyer pays or carries for a given hammer price, and the profit left from the resale.
export function economics(bid, repairsTotal, tiers, o) {
  const fee = buyerFee(bid, tiers);
  const taxBase = o.taxBase === "none" ? 0 : o.taxBase === "bid" ? bid : bid + fee + o.flatFees;
  const tax = (taxBase * o.taxRatePct) / 100;
  const acquisition = bid + fee + o.flatFees + tax;
  const repairs = repairsTotal * (1 + o.overrunPct / 100);
  const carry = o.holdingDays * o.holdingPerDay;
  const interest = ((acquisition + repairs) * (o.aprPct / 100) * o.holdingDays) / 365;
  const selling = o.resale * (o.sellPct / 100) + o.sellFixed;
  const landed = acquisition + o.transport + o.titleFees + repairs + carry + interest + selling;
  const profit = o.resale - landed;
  const invested = acquisition + o.transport + o.titleFees + repairs;
  return { bid, fee, tax, acquisition, repairs, carry, interest, selling, landed, profit, invested, roi: invested > 0 ? profit / invested : null };
}

const requiredProfit = (o) => Math.max(o.targetProfit, (o.resale * o.targetPct) / 100);

// Largest hammer price (to the cent) that still leaves the required profit. Profit falls as the bid rises,
// so a bisection is exact; a fee schedule that drops as bids rise is flagged because it breaks that.
export function maxBid(repairsTotal, tiers, o) {
  const need = requiredProfit(o);
  if (economics(0, repairsTotal, tiers, o).profit < need - 1e-9) return null;
  let lo = 0, hi = o.resale;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (economics(mid, repairsTotal, tiers, o).profit >= need) lo = mid; else hi = mid;
  }
  return Math.floor(lo * 100 + 1e-6) / 100;
}

export function breakEvenBid(repairsTotal, tiers, o) {
  return maxBid(repairsTotal, tiers, { ...o, targetProfit: 0, targetPct: 0 });
}

export function analyze(repairsTotal, tiers, opts = {}, planBid = null) {
  const o = clean(opts);
  const bad = validate(o);
  if (bad) return { error: bad };
  if (!Number.isFinite(repairsTotal) || repairsTotal < 0) return { error: "Repairs must be zero or more." };
  const warnings = [];
  for (let i = 1; i < tiers.length; i++) {
    if (buyerFee(tiers[i].upTo, tiers) + 1e-9 < buyerFee(tiers[i - 1].upTo, tiers)) { warnings.push("A higher fee tier charges less than a lower one, so the max bid may not be the only profitable range. Check the tier list."); break; }
  }
  if (tiers.length && tiers[tiers.length - 1].upTo < o.resale) warnings.push(`Your last fee tier stops at ${tiers[tiers.length - 1].upTo}; bids above it use that tier's fee.`);
  if (!tiers.length) warnings.push("No buyer fee tiers entered, so only the flat fees count. Auction buyer fees are often a large share of the cost; add them from the auction's own schedule.");

  const need = requiredProfit(o);
  const max = maxBid(repairsTotal, tiers, o);
  const breakEven = breakEvenBid(repairsTotal, tiers, o);
  const atMax = max === null ? null : economics(max, repairsTotal, tiers, o);

  // Bid ladder: profit at fractions of the max bid (or of the resale price when no profitable bid exists).
  const top = max !== null ? max : o.resale * 0.5;
  const steps = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2];
  const ladder = steps.map((s) => economics(Math.round(top * s), repairsTotal, tiers, o));

  // Stress grid: max bid when repairs run over and the car sells for less.
  const overruns = [0, 25, 50, 100], drops = [0, 5, 10, 15];
  const stress = overruns.map((ov) => ({
    overrunPct: ov,
    cells: drops.map((dp) => ({ dropPct: dp, maxBid: maxBid(repairsTotal, tiers, { ...o, overrunPct: o.overrunPct + ov, resale: o.resale * (1 - dp / 100) }) })),
  }));

  let plan = null;
  if (planBid !== null && planBid !== undefined && planBid !== "") {
    const pb = num(planBid, NaN);
    if (!Number.isFinite(pb) || pb < 0) return { error: "Check the number in the bid you plan to place." };
    plan = economics(pb, repairsTotal, tiers, o);
    plan.meetsTarget = plan.profit >= need - 1e-9;
  }

  const fixedCost = o.transport + o.titleFees + repairsTotal * (1 + o.overrunPct / 100) + o.holdingDays * o.holdingPerDay + o.flatFees;
  let verdict;
  if (max === null) verdict = `No bid works: even at a $0 bid the costs leave less than the required ${need.toFixed(0)} profit. Fixed costs before any bid are about ${fixedCost.toFixed(0)}.`;
  else verdict = `Bid up to ${max.toFixed(2)} and the car clears your required ${need.toFixed(0)} profit; it breaks even at ${breakEven.toFixed(2)}.`;

  return { options: o, required: need, maxBid: max, breakEvenBid: breakEven, atMax, ladder, stress, plan, fixedCost, verdict, warnings };
}

export function sampleRepairs() {
  return "item,cost\nFront bumper and headlight,640\nRadiator and condenser,380\nPaint and blend,720\nAirbag module reset,450\nDetail and tires,260";
}
export function sampleFeeTiers() {
  return "bid up to,fee\n499.99,60\n999.99,150\n1999.99,250\n4999.99,6%\n999999,5%";
}

const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : "");
export function reportCsv(r) {
  const out = [["Bid", "Buyer fee", "Tax", "Repairs", "Holding and interest", "Selling cost", "All-in cost", "Profit", "Return on cash"]];
  for (const l of r.ladder) out.push([f2(l.bid), f2(l.fee), f2(l.tax), f2(l.repairs), f2(l.carry + l.interest), f2(l.selling), f2(l.landed), f2(l.profit), l.roi === null ? "" : f2(l.roi * 100) + "%"]);
  out.push([]);
  out.push(["Max bid", "Break-even bid", "Required profit"]);
  out.push([r.maxBid === null ? "none" : f2(r.maxBid), r.breakEvenBid === null ? "none" : f2(r.breakEvenBid), f2(r.required)]);
  out.push([]);
  out.push(["Max bid by repair overrun and resale drop", ...r.stress[0].cells.map((c) => `-${c.dropPct}% resale`)]);
  for (const row of r.stress) out.push([`+${row.overrunPct}% repairs`, ...row.cells.map((c) => (c.maxBid === null ? "none" : f2(c.maxBid)))]);
  const q = (c) => { const s = String(c); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return out.map((row) => row.map(q).join(",")).join("\n") + "\n";
}

export const money = (v) => (v < 0 ? "-$" : "$") + Math.round(Math.abs(v)).toLocaleString("en-US");
export const money2 = (v) => (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const pct = (v, d = 1) => (v * 100).toFixed(d) + "%";
