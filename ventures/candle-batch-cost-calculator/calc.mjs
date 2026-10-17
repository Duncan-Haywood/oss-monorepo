// Batch cost, price floors and channel margin for a candle or soap maker. Pure functions, no DOM.
// Arithmetic on figures the user types; nothing here is a market price, a wage or a tax rule.

export const DEFAULTS = Object.freeze({
  waxPerLb: 0,
  fragrancePerOz: 0,
  fragrancePct: 8,
  wastePct: 5,
  hourlyWage: 0,
  marketplaceFeePct: 9,
  paymentFeePct: 3,
  wholesaleSharePct: 20,
  fairSharePct: 0,
  fairBoothMonthly: 0,
  overheadMonthly: 0,
  targetMarginPct: 50,
  waxIncreasePct: 10,
});

const num = (v, d = 0) => {
  if (v === "" || v === null || v === undefined) return d;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

// Lines: "product, retail price, wholesale price, wax oz per unit, other cost per unit, labor minutes per unit, units per month".
// Other cost is vessel, wick, label, box and anything else that is not wax or fragrance. Header optional.
export function parseProducts(text) {
  const rows = [];
  let skipped = 0;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const cells = (line.includes("\t") ? line.split("\t") : line.split(",")).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (cells.length < 4) { skipped++; continue; }
    const retail = num(cells[1], NaN);
    if (!Number.isFinite(retail)) { if (rows.length || !/retail|price|product|name/i.test(line)) skipped++; continue; }
    const wholesale = num(cells[2], 0), waxOz = num(cells[3], NaN), other = num(cells[4], 0), minutes = num(cells[5], 0), units = num(cells[6], 0);
    if (retail <= 0 || !(wholesale >= 0) || !(waxOz > 0) || !(other >= 0) || !(minutes >= 0) || !(units >= 0)) { skipped++; continue; }
    rows.push({ name: cells[0] || "Product", retail, wholesale, waxOz, other, minutes, units });
  }
  const warnings = skipped ? [`${skipped} line(s) skipped (need a name, a positive retail price and a positive wax weight in ounces).`] : [];
  if (!rows.length) return { error: "Add at least one product: name, retail price, wholesale price, wax oz, other cost per unit, labor minutes, units per month." };
  return { rows, warnings };
}

const clean = (opts) => {
  const o = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) if (opts && opts[k] !== undefined) o[k] = num(opts[k], DEFAULTS[k]);
  return o;
};

// Cost of one unit. Wax and fragrance are bought by the weight you pour, but some is lost in the pot,
// the pitcher and trimmed tops, so the cost is grossed up by the waste share.
export function unitCost(p, o) {
  const keep = 1 - o.wastePct / 100;
  const wax = (p.waxOz / 16) * o.waxPerLb / keep;
  const fragrance = p.waxOz * (o.fragrancePct / 100) * o.fragrancePerOz / keep;
  const labor = (p.minutes / 60) * o.hourlyWage;
  return { wax, fragrance, other: p.other, labor, materials: wax + fragrance + p.other, total: wax + fragrance + p.other + labor };
}

export function analyze(products, opts = {}) {
  const o = clean(opts);
  for (const k of Object.keys(DEFAULTS)) if (!Number.isFinite(o[k]) || o[k] < 0) return { error: `Check the number in "${k}".` };
  if (o.wastePct >= 50) return { error: "Waste must be under 50%." };
  if (o.fragrancePct > 30) return { error: "Fragrance load above 30% of wax weight is not a candle; check the figure." };
  if (o.marketplaceFeePct + o.paymentFeePct >= 100) return { error: "Fees must total under 100%." };
  if (o.wholesaleSharePct + o.fairSharePct > 100) return { error: "Wholesale share plus fair share cannot exceed 100% of units." };
  if (o.targetMarginPct >= 100) return { error: "Target margin must be under 100%." };
  const warnings = [];
  const onlineFee = (o.marketplaceFeePct + o.paymentFeePct) / 100;
  const fairFee = o.paymentFeePct / 100;
  const wS = o.wholesaleSharePct / 100, fS = o.fairSharePct / 100, oS = 1 - wS - fS;
  const target = o.targetMarginPct / 100;

  const lines = products.map((p) => {
    const c = unitCost(p, o);
    const onlineNet = p.retail * (1 - onlineFee) - c.total;
    const fairNet = p.retail * (1 - fairFee) - c.total;
    const wholesaleNet = p.wholesale > 0 ? p.wholesale - c.total : null;
    const blendedNet = oS * onlineNet + fS * fairNet + (p.wholesale > 0 ? wS * wholesaleNet : wS * onlineNet);
    // margin = net / price  =>  price = cost / ((1 - fee) - margin); wholesale carries no fee here.
    const floorOnline = (1 - onlineFee) - target > 0 ? c.total / ((1 - onlineFee) - target) : null;
    const floorWholesale = c.total / (1 - target);
    const wholesaleRatio = p.wholesale > 0 ? p.wholesale / p.retail : null;
    const perHourOnline = p.minutes > 0 ? (p.retail * (1 - onlineFee) - c.materials) / (p.minutes / 60) : null;
    return {
      ...p, cost: c, onlineNet, fairNet, wholesaleNet, blendedNet,
      onlineMargin: onlineNet / p.retail,
      wholesaleMargin: wholesaleNet === null ? null : wholesaleNet / p.wholesale,
      floorOnline, floorWholesale, wholesaleRatio, perHourOnline,
      monthlyNet: p.units * blendedNet,
      monthlyRevenue: p.units * (oS * p.retail * (1 - onlineFee) + fS * p.retail * (1 - fairFee) + wS * (p.wholesale > 0 ? p.wholesale : p.retail * (1 - onlineFee))),
      monthlyMinutes: p.units * p.minutes,
      underFloor: floorOnline !== null && p.retail < floorOnline,
    };
  });

  const contribution = lines.reduce((a, l) => a + l.monthlyNet, 0);
  const units = lines.reduce((a, l) => a + l.units, 0);
  const hours = lines.reduce((a, l) => a + l.monthlyMinutes, 0) / 60;
  const fixed = o.overheadMonthly + o.fairBoothMonthly;
  const net = contribution - fixed;
  const avgNet = units > 0 ? contribution / units : 0;
  const breakEvenUnits = avgNet > 0 ? fixed / avgNet : null;
  // What the owner earns per hour of making if wages are not charged: contribution before labor, over hours.
  const laborCharged = lines.reduce((a, l) => a + l.units * l.cost.labor, 0);
  const effectiveHourly = hours > 0 ? (net + laborCharged) / hours : null;

  // Wax price shock: re-cost every line with wax +X% and report the lost monthly net.
  const shocked = { ...o, waxPerLb: o.waxPerLb * (1 + o.waxIncreasePct / 100) };
  const waxLoss = lines.reduce((a, l) => a + l.units * (unitCost(l, shocked).wax - l.cost.wax), 0);

  if (o.waxPerLb === 0) warnings.push("Wax cost per pound is zero, so wax is treated as free; enter what you pay per pound.");
  if (o.hourlyWage === 0 && lines.some((l) => l.minutes > 0)) warnings.push("Hourly wage is zero, so your own making time is treated as free; enter what an hour of your time is worth to see true margin.");
  if (lines.some((l) => l.onlineNet < 0)) warnings.push("At least one product loses money on every online sale after materials, labor and fees.");
  if (lines.some((l) => l.wholesaleNet !== null && l.wholesaleNet < 0)) warnings.push("At least one product loses money at its wholesale price.");
  if (lines.some((l) => l.underFloor)) warnings.push(`At least one product is priced below the retail price that would give a ${o.targetMarginPct}% margin online.`);
  if (wS > 0 && lines.some((l) => l.wholesale <= 0)) warnings.push("Some products have no wholesale price; their wholesale share is costed at the online price.");

  const worst = lines.filter((l) => l.units > 0).sort((a, b) => a.blendedNet - b.blendedNet)[0] || null;
  const verdict = net <= 0
    ? "At these figures the month does not cover its fixed costs."
    : `The month nets ${money(net)} after fixed costs${effectiveHourly !== null ? `, about ${money(effectiveHourly)} for each hour you spend making` : ""}. A ${o.waxIncreasePct}% wax price rise would cost ${money(waxLoss)} a month.`;

  return {
    options: o, lines,
    month: { contribution, fixed, net, annual: net * 12, units, hours, avgNet, breakEvenUnits, effectiveHourly, waxLoss, worst: worst ? worst.name : null },
    verdict, warnings,
  };
}

export function sampleProducts() {
  return "product,retail,wholesale,wax oz,other cost,labor minutes,units per month\n8 oz soy jar,24,12,8,3.2,12,120\n4 oz travel tin,12,6,4,1.4,8,80\nWax melts clamshell,9,4.5,3,0.9,5,150\nHoliday 12 oz three-wick,38,19,12,5.1,15,40";
}

const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : "");
export function reportCsv(r) {
  const out = [["Product", "Retail", "Wholesale", "Cost per unit", "Online net", "Online margin %", "Wholesale net", "Retail floor for target", "Net per month"]];
  for (const l of r.lines) out.push([l.name, f2(l.retail), f2(l.wholesale), f2(l.cost.total), f2(l.onlineNet), f2(l.onlineMargin * 100), l.wholesaleNet === null ? "" : f2(l.wholesaleNet), l.floorOnline === null ? "" : f2(l.floorOnline), f2(l.monthlyNet)]);
  out.push([]);
  out.push(["Month", "Contribution", "Fixed costs", "Net", "Units", "Hours making", "Effective hourly"]);
  out.push(["", f2(r.month.contribution), f2(r.month.fixed), f2(r.month.net), f2(r.month.units), f2(r.month.hours), r.month.effectiveHourly === null ? "" : f2(r.month.effectiveHourly)]);
  const q = (c) => { const s = String(c); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return out.map((row) => row.map(q).join(",")).join("\n") + "\n";
}

export const money = (v) => (v < 0 ? "-$" : "$") + Math.round(Math.abs(v)).toLocaleString("en-US");
export const money2 = (v) => (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const pct = (v, d = 1) => (v * 100).toFixed(d) + "%";
