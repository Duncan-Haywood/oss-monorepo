// Commercial lease offer comparison: net effective rent and the all-in cost of
// occupying a space, per offer, so up to three offers can be ranked on one
// basis. Pure arithmetic, no I/O, no imports.
//
// A landlord quotes the headline base rent. What a tenant actually pays is that
// rent, minus the months of free rent and the tenant-improvement (TI)
// allowance, plus the operating costs (NNN / CAM, taxes, insurance) that grow
// each year, plus the fit-out the allowance does not cover, plus moving and
// legal costs. Free rent and TI arrive at the start and the escalations arrive
// at the end, so the offers are compared on present value at the tenant's own
// discount rate and reduced to one levelized cost per square foot per year.

export const money = (v) => (v == null || !Number.isFinite(v) ? "n/a" : (v < 0 ? "-" : "") + "$" + Math.round(Math.abs(v)).toLocaleString("en-US"));
export const money2 = (v) => (v == null || !Number.isFinite(v) ? "n/a" : (v < 0 ? "-" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export const pct = (v) => (v == null || !Number.isFinite(v) ? "n/a" : (v * 100).toFixed(1) + "%");

const num = (v, d = 0) => {
  if (v === "" || v == null) return d;
  const n = Number(String(v).replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};
const blank = (v) => v === "" || v == null;

export const OFFER_FIELDS = ["name", "sf", "rent", "esc", "term", "free", "nnn", "nnnGrowth", "ti", "build", "other", "deposit"];

// An offer slot with no size and no rent is simply not in use.
export function isUsed(raw) {
  return !(blank(raw.sf) && blank(raw.rent));
}

export function normalizeOffer(raw, label) {
  const o = {
    label,
    name: String(raw.name || "").trim() || label,
    sf: num(raw.sf),
    rent: num(raw.rent),
    esc: num(raw.esc) / 100,
    term: Math.round(num(raw.term)),
    free: Math.round(num(raw.free)),
    nnn: num(raw.nnn),
    nnnGrowth: num(raw.nnnGrowth) / 100,
    ti: num(raw.ti),
    build: num(raw.build),
    other: num(raw.other),
    deposit: num(raw.deposit),
  };
  const errs = [];
  const p = `${o.name}: `;
  if (!(o.sf > 0)) errs.push(p + "enter the rentable square feet.");
  if (!(o.rent >= 0)) errs.push(p + "base rent per square foot per year must be zero or more.");
  if (!(o.esc >= 0 && o.esc <= 0.2)) errs.push(p + "annual escalation must be between 0% and 20%.");
  if (!(o.term >= 6 && o.term <= 240)) errs.push(p + "term must be 6 to 240 months.");
  if (!(o.free >= 0 && o.free < o.term)) errs.push(p + "free rent months must be zero or more and fewer than the term.");
  if (!(o.nnn >= 0)) errs.push(p + "NNN / operating costs per square foot per year must be zero or more.");
  if (!(o.nnnGrowth >= 0 && o.nnnGrowth <= 0.2)) errs.push(p + "operating cost growth must be between 0% and 20%.");
  if (!(o.ti >= 0)) errs.push(p + "TI allowance must be zero or more.");
  if (!(o.build >= 0)) errs.push(p + "your build-out cost must be zero or more.");
  if (!(o.other >= 0)) errs.push(p + "other up-front costs must be zero or more.");
  if (!(o.deposit >= 0)) errs.push(p + "security deposit must be zero or more.");
  return { o, errs };
}

export function normalizeShared(raw) {
  const s = {
    discount: blank(raw.discount) ? 0.08 : num(raw.discount) / 100,
    freeNnn: raw.freeNnn === "abated" ? "abated" : "payable",
  };
  const errs = [];
  if (!(s.discount >= 0 && s.discount <= 0.5)) errs.push("Discount rate must be between 0% and 50%.");
  return { s, errs };
}

// Monthly base rent and operating cost for one offer, months 1..term.
export function schedule(o, shared) {
  const rows = [];
  for (let m = 1; m <= o.term; m++) {
    const y = Math.floor((m - 1) / 12);
    const freeMonth = m <= o.free;
    const base = freeMonth ? 0 : (o.sf * o.rent / 12) * Math.pow(1 + o.esc, y);
    const opex = freeMonth && shared.freeNnn === "abated" ? 0 : (o.sf * o.nnn / 12) * Math.pow(1 + o.nnnGrowth, y);
    rows.push({ m, year: y + 1, base, opex });
  }
  return rows;
}

function pvOf(o, shared, rows) {
  const i = Math.pow(1 + shared.discount, 1 / 12) - 1;
  const upfront = (o.build - o.ti) * o.sf + o.other + o.deposit;
  let pv = upfront, annuity = 0, pvBase = 0;
  for (const r of rows) {
    const d = Math.pow(1 + i, -r.m);
    pv += (r.base + r.opex) * d;
    pvBase += r.base * d;
    annuity += d;
  }
  pv -= o.deposit * Math.pow(1 + i, -o.term); // deposit comes back at the end
  return { pv, annuity, pvBase, upfront };
}

export function analyzeOffer(o, shared) {
  const rows = schedule(o, shared);
  const years = o.term / 12;
  const baseTotal = rows.reduce((s, r) => s + r.base, 0);
  const opexTotal = rows.reduce((s, r) => s + r.opex, 0);
  const netCapex = (o.build - o.ti) * o.sf + o.other;
  const totalCost = baseTotal + opexTotal + netCapex; // deposit is returned, so it nets out
  const { pv, annuity, pvBase } = pvOf(o, shared, rows);
  const grossBase = rows.length ? (o.sf * o.rent / 12) * rows.reduce((s, r) => s + Math.pow(1 + o.esc, r.year - 1), 0) : 0;
  const freeRentValue = grossBase - baseTotal;
  const out = {
    offer: o, years,
    headlineRent: o.rent,
    avgContractRent: baseTotal / years / o.sf, // what is actually paid, free months spread over the term
    netEffectiveRent: (baseTotal - o.ti * o.sf) / years / o.sf,
    allInPerSfYear: totalCost / years / o.sf,
    levelizedPerSfYear: (pv / annuity) * 12 / o.sf,
    levelizedMonthly: pv / annuity,
    pv, totalCost, baseTotal, opexTotal, netCapex, freeRentValue,
    tiValue: o.ti * o.sf,
    tiShortfall: Math.max(0, (o.build - o.ti) * o.sf),
    commitment: baseTotal + opexTotal,
    opexShare: opexTotal / (baseTotal + opexTotal || 1),
    year1MonthlyPerSf: null,
    years_: [], leave: [], findings: [],
  };
  out.year1MonthlyPerSf = (o.rent + o.nnn) / 12;
  for (let y = 1; y <= Math.ceil(years); y++) {
    const yr = rows.filter((r) => r.year === y);
    const base = yr.reduce((s, r) => s + r.base, 0), opex = yr.reduce((s, r) => s + r.opex, 0);
    out.years_.push({ year: y, months: yr.length, base, opex, total: base + opex, perSfMonth: (base + opex) / yr.length / o.sf });
  }
  // What leaving early does to the cost per square foot per year: the fit-out is
  // spent and the free months are used up front, so a short stay is dear.
  const stops = [12, 24, 36, 60, 84, 120].filter((k) => k < o.term).concat([o.term]);
  out.leave = stops.map((k) => {
    const cost = rows.filter((r) => r.m <= k).reduce((s, r) => s + r.base + r.opex, 0) + netCapex;
    return { months: k, cost, perSfYear: cost / (k / 12) / o.sf };
  });
  return out;
}

// Base rent per square foot that would make `target` cost the same levelized
// amount as `goal` does. The present value is linear in the base rent, so one
// probe gives the slope exactly.
export function breakEvenRent(o, shared, goalLevPerSfYear) {
  const at = (rent) => analyzeOffer({ ...o, rent }, shared).levelizedPerSfYear;
  const y0 = at(0), y1 = at(1);
  const slope = y1 - y0;
  if (!(slope > 0)) return null;
  const r = (goalLevPerSfYear - y0) / slope;
  return r;
}

export function compareOffers(rawOffers, rawShared) {
  const sh = normalizeShared(rawShared || {});
  const errs = [...sh.errs];
  const labels = ["Offer A", "Offer B", "Offer C"];
  const used = [];
  rawOffers.forEach((raw, idx) => {
    if (idx > 0 && !isUsed(raw)) return;
    const n = normalizeOffer(raw, labels[idx] || `Offer ${idx + 1}`);
    errs.push(...n.errs);
    used.push(n.o);
  });
  if (errs.length) return { error: errs.join(" ") };
  const results = used.map((o) => analyzeOffer(o, sh.s));
  const ranked = [...results].sort((a, b) => a.levelizedPerSfYear - b.levelizedPerSfYear);
  const best = ranked[0];
  const findings = [];
  const sizesDiffer = results.some((r) => Math.abs(r.offer.sf - results[0].offer.sf) / results[0].offer.sf > 0.05);

  if (results.length > 1) {
    const worst = ranked[ranked.length - 1];
    const byHeadline = [...results].sort((a, b) => a.headlineRent - b.headlineRent)[0];
    if (byHeadline !== best) {
      findings.push({ severity: "high", title: `${best.offer.name} is cheapest overall, but ${byHeadline.offer.name} has the lowest headline rent`, detail: `${byHeadline.offer.name} quotes ${money2(byHeadline.headlineRent)}/SF/yr against ${money2(best.headlineRent)} for ${best.offer.name}. On a present-value basis at ${pct(sh.s.discount)}, ${best.offer.name} costs ${money2(best.levelizedPerSfYear)}/SF/yr all-in and ${byHeadline.offer.name} costs ${money2(byHeadline.levelizedPerSfYear)}. The headline rent is the wrong number to compare.` });
    } else {
      findings.push({ severity: "info", title: `${best.offer.name} is cheapest overall and also has the lowest headline rent`, detail: `${money2(best.levelizedPerSfYear)}/SF/yr all-in on a present-value basis, against ${money2(worst.levelizedPerSfYear)} for ${worst.offer.name}.` });
    }
    if (sizesDiffer) findings.push({ severity: "medium", title: "The spaces are different sizes", detail: "Rankings use cost per square foot. A smaller space with a higher rate can still cost less in total: compare the levelized monthly dollars too, and ask whether you need the extra space." });
    for (const r of ranked.slice(1)) {
      const be = breakEvenRent(r.offer, sh.s, best.levelizedPerSfYear);
      if (be != null && be >= 0 && be < r.offer.rent) {
        r.counter = { rent: be, cut: r.offer.rent - be };
        findings.push({ severity: "info", title: `To match ${best.offer.name}, ${r.offer.name} would need a base rent of ${money2(be)}/SF/yr`, detail: `That is ${money2(r.offer.rent - be)}/SF/yr below the quote (${money(r.counter.cut * r.offer.sf)} a year on ${r.offer.sf.toLocaleString("en-US")} SF), holding everything else in that offer fixed. More free rent or TI would close the same gap in another form.` });
      } else if (be != null && be < 0) {
        findings.push({ severity: "info", title: `${r.offer.name} cannot match ${best.offer.name} on rent alone`, detail: "Even at zero base rent its operating costs and fit-out leave it dearer. The gap is in operating costs, TI or the build-out." });
      }
    }
  }
  for (const r of results) {
    const n = r.offer.name;
    if (r.opexShare >= 0.3) findings.push({ severity: "medium", title: `${n}: operating costs are ${pct(r.opexShare)} of what you pay the landlord`, detail: `${money(r.opexTotal)} of ${money(r.commitment)} over the term is NNN / CAM, taxes and insurance, the part the landlord bills after the fact. Ask for a cap on controllable expenses and the audit right.` });
    if (r.tiShortfall > 0) findings.push({ severity: "medium", title: `${n}: the TI allowance covers ${pct(Math.min(1, r.tiValue / (r.offer.build * r.offer.sf || 1)))} of your build-out`, detail: `You fund about ${money(r.tiShortfall)} of the fit-out yourself. Confirm whether the allowance is paid as work is done or as a rent credit, and whether unspent allowance is lost.` });
    const first = r.leave[0], full = r.leave[r.leave.length - 1];
    if (first && full && first.months < full.months && first.perSfYear > full.perSfYear * 1.5) findings.push({ severity: "medium", title: `${n}: leaving after ${first.months} months costs ${money2(first.perSfYear)}/SF/yr, against ${money2(full.perSfYear)} if you stay the full term`, detail: "The fit-out and one-time costs are spent up front and are not recovered. If your plans are uncertain, a shorter term or a termination option is worth real money." });
    findings.push({ severity: "info", title: `${n}: the lease commits you to ${money(r.commitment)}`, detail: `Base rent and operating costs over ${r.offer.term} months, before any early-termination right. A personal guarantee usually puts this on the owner personally.` });
  }
  return { shared: sh.s, results, ranked, best, findings, sizesDiffer };
}

export function sampleOffers() {
  return [
    { name: "Main Street (A)", sf: "3000", rent: "30", esc: "3", term: "60", free: "3", nnn: "9.5", nnnGrowth: "3", ti: "20", build: "45", other: "12000", deposit: "10000" },
    { name: "Plaza (B)", sf: "3000", rent: "26", esc: "3", term: "60", free: "1", nnn: "8", nnnGrowth: "3", ti: "5", build: "45", other: "12000", deposit: "8000" },
    { name: "Loft (C)", sf: "2600", rent: "32", esc: "2.5", term: "84", free: "4", nnn: "6", nnnGrowth: "2.5", ti: "30", build: "50", other: "12000", deposit: "12000" },
  ];
}
export function sampleShared() {
  return { discount: "8", freeNnn: "payable" };
}

export function reportCsv(c) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const rows = [["measure", ...c.results.map((r) => r.offer.name)]];
  const line = (label, f) => rows.push([label, ...c.results.map(f)]);
  line("square_feet", (r) => r.offer.sf);
  line("term_months", (r) => r.offer.term);
  line("headline_rent_per_sf_year", (r) => r.headlineRent.toFixed(2));
  line("net_effective_rent_per_sf_year", (r) => r.netEffectiveRent.toFixed(2));
  line("all_in_per_sf_year_undiscounted", (r) => r.allInPerSfYear.toFixed(2));
  line("all_in_per_sf_year_levelized_pv", (r) => r.levelizedPerSfYear.toFixed(2));
  line("levelized_monthly", (r) => r.levelizedMonthly.toFixed(2));
  line("present_value_total", (r) => r.pv.toFixed(2));
  line("total_cost_undiscounted", (r) => r.totalCost.toFixed(2));
  line("committed_rent_and_opex", (r) => r.commitment.toFixed(2));
  line("free_rent_value", (r) => r.freeRentValue.toFixed(2));
  line("ti_allowance_value", (r) => r.tiValue.toFixed(2));
  rows.push(["discount_rate", (c.shared.discount * 100).toFixed(2) + "%"]);
  return rows.map((row) => row.map(q).join(",")).join("\n") + "\n";
}
