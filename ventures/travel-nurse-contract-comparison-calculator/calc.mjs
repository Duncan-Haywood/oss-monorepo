// Travel-nurse (and locum) contract comparison. Pure functions, no I/O, no imports.
// Turns each offer's headline weekly gross into what the nurse keeps: taxable
// wages, untaxed stipends, guaranteed-hours risk, health premium, housing and
// travel cost, and the unpaid gap between assignments. Rates are typed in by
// the visitor; nothing here is a tax rule, a per-diem table or a payroll result.

export const FICA = 0.0765;
export const MAX_OFFERS = 3;
export const CANCEL_STEPS = [0, 10, 20, 30];

export function money(n) {
  const v = Math.round(Math.abs(n));
  return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function signedMoney(n) {
  const r = Math.round(n);
  return (r < 0 ? "-$" : "+$") + money(r);
}

function num(v) {
  if (v === "" || v === null || v === undefined) return NaN;
  const n = Number(String(v).replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

function optional(v, dflt) {
  const n = num(v);
  return Number.isNaN(n) ? dflt : n;
}

export function parseOffer(raw, label) {
  const rate = num(raw.rate), hours = num(raw.hours), weeks = num(raw.weeks);
  if (!(rate > 0 && rate <= 500)) return { error: `${label}: enter the taxable hourly rate (a positive amount up to $500).` };
  if (!(hours > 0 && hours <= 80)) return { error: `${label}: enter the guaranteed hours per week (1 to 80).` };
  if (!(weeks >= 1 && weeks <= 104)) return { error: `${label}: enter the contract length in weeks (1 to 104).` };
  const o = {
    label: String(raw.name || "").trim() || label,
    rate, hours, weeks,
    otHours: optional(raw.otHours, 0),
    otMult: optional(raw.otMult, 1.5),
    housing: optional(raw.housing, 0),
    mie: optional(raw.mie, 0),
    bonus: optional(raw.bonus, 0),
    travel: optional(raw.travel, 0),
    housingCost: optional(raw.housingCost, 0),
    travelCost: optional(raw.travelCost, 0),
    premium: optional(raw.premium, 0),
    gap: optional(raw.gap, 0),
    cancel: optional(raw.cancel, 0),
    guaranteed: raw.guaranteed === true || raw.guaranteed === "yes",
    prorate: raw.prorate === true || raw.prorate === "yes",
    gsaLodging: optional(raw.gsaLodging, 0),
    gsaMie: optional(raw.gsaMie, 0),
  };
  const bounded = [["otHours", 0, 60, "overtime hours per week"], ["otMult", 1, 3, "overtime multiplier"], ["housing", 0, 10000, "weekly housing stipend"], ["mie", 0, 3000, "weekly meals and incidentals stipend"], ["bonus", 0, 100000, "bonus"], ["travel", 0, 20000, "travel reimbursement"], ["housingCost", 0, 10000, "weekly housing cost"], ["travelCost", 0, 20000, "travel cost"], ["premium", 0, 3000, "weekly health premium"], ["gap", 0, 52, "unpaid gap weeks"], ["cancel", 0, 100, "cancelled-hours percentage"], ["gsaLodging", 0, 2000, "daily lodging rate"], ["gsaMie", 0, 500, "daily meals rate"]];
  for (const [k, lo, hi, what] of bounded) {
    if (!(o[k] >= lo && o[k] <= hi)) return { error: `${label}: ${what} must be between ${lo} and ${hi}.` };
  }
  return o;
}

// Share of scheduled hours actually paid. A guarantee means cancelled shifts cost nothing.
function paidShare(o, cancelPct) {
  return o.guaranteed ? 1 : 1 - cancelPct / 100;
}

// What one offer pays and costs over its contract and the gap that follows it.
// `tax` = { rate (fraction, federal + state on taxable pay), taxHome (bool) }.
export function evaluate(o, tax, cancelPct = o.cancel) {
  const f = paidShare(o, cancelPct);
  const taxLoad = tax.rate + FICA;
  const weekTaxable = (o.rate * o.hours + o.rate * o.otMult * o.otHours) * f;
  const stipendShare = o.prorate && !o.guaranteed ? f : 1;
  const weekStipend = (o.housing + o.mie) * stipendShare;
  // Stipends are untaxed only for a nurse who keeps a qualifying tax home. Without one, the
  // same dollars are wages.
  const weekStipendTaxable = tax.taxHome ? 0 : weekStipend;
  const oneTimeUntaxed = tax.taxHome ? o.travel : 0;
  const oneTimeTaxable = o.bonus + (tax.taxHome ? 0 : o.travel);
  const gross = o.weeks * (weekTaxable + weekStipend) + o.bonus + o.travel;
  const taxes = (o.weeks * (weekTaxable + weekStipendTaxable) + oneTimeTaxable) * taxLoad;
  const costs = o.weeks * (o.premium + o.housingCost) + o.travelCost;
  const net = gross - taxes - costs;
  const span = o.weeks + o.gap;
  return {
    weekTaxable, weekStipend, gross, taxes, costs, net, span,
    grossWeekly: (weekTaxable + weekStipend),
    netPerWeekWorking: net / o.weeks,
    netPerWeekAll: net / span,
    netPerYear: (net / span) * 52,
    untaxedShare: gross > 0 ? (o.weeks * weekStipend * (tax.taxHome ? 1 : 0) + oneTimeUntaxed) / gross : 0,
    oneTimeUntaxed,
  };
}

// Net is linear in the taxable rate, so the rate an offer needs to match a target is exact.
export function rateToMatch(o, tax, targetPerWeekAll) {
  const a = evaluate(o, tax).netPerWeekAll;
  const b = evaluate({ ...o, rate: o.rate + 1 }, tax).netPerWeekAll;
  const slope = b - a;
  if (!(slope > 0)) return null;
  return o.rate + (targetPerWeekAll - a) / slope;
}

export function parseTax(raw) {
  const rate = num(raw.taxRate);
  if (!(rate >= 0 && rate <= 60)) return { error: "Enter the combined federal and state tax rate on your taxable pay as a percentage between 0 and 60." };
  return { rate: rate / 100, taxHome: raw.taxHome === true || raw.taxHome === "yes" };
}

function findings(offers, results, tax, best) {
  const out = [];
  const top = results[best];
  const grossBest = results.reduce((bi, r, i) => (r.grossWeekly > results[bi].grossWeekly ? i : bi), 0);
  if (grossBest !== best) {
    const g = results[grossBest], gap = top.netPerWeekAll - g.netPerWeekAll;
    out.push({ severity: "medium", title: `${offers[grossBest].label} has the biggest weekly gross but not the biggest take-home`, detail: `${offers[grossBest].label} advertises $${money(g.grossWeekly)} a week; ${offers[best].label} advertises $${money(top.grossWeekly)}. After tax, health premium, housing, travel and the unpaid gap, ${offers[best].label} keeps about $${money(gap)} a week more.` });
  }
  offers.forEach((o, i) => {
    const r = results[i];
    const stipendPct = r.grossWeekly > 0 ? (o.housing + o.mie) / (o.housing + o.mie + r.weekTaxable) : 0;
    if (tax.taxHome && stipendPct >= 0.5) {
      out.push({ severity: "medium", title: `${o.label}: ${(stipendPct * 100).toFixed(0)}% of weekly pay is stipend`, detail: `Stipends stay untaxed only while you keep a qualifying tax home and have duplicate living costs. If that stops being true, the same dollars are wages. A low taxable rate also lowers overtime pay (${o.otMult}x the taxable rate), unemployment benefits and, for some lenders, the income they count.` });
    }
    if (!tax.taxHome && (o.housing + o.mie) > 0) {
      out.push({ severity: "info", title: `${o.label}: stipends are being taxed here`, detail: "You said you do not keep a tax home, so the housing and meals stipends are treated as wages in this comparison. Check the tax-home box if you do qualify; the result changes a lot." });
    }
    if (o.gsaLodging > 0 && o.housing > o.gsaLodging * 7) {
      out.push({ severity: "medium", title: `${o.label}: housing stipend is above the per-diem ceiling you entered`, detail: `$${money(o.housing)} a week is more than 7 x $${money(o.gsaLodging)}. Amounts above the federal per-diem rate for the assignment city can be taxable. Confirm the rate for the city and dates with the agency or a tax professional.` });
    }
    if (o.gsaMie > 0 && o.mie > o.gsaMie * 7) {
      out.push({ severity: "medium", title: `${o.label}: meals stipend is above the per-diem ceiling you entered`, detail: `$${money(o.mie)} a week is more than 7 x $${money(o.gsaMie)}. Confirm the rate for the city and dates.` });
    }
    if (!o.guaranteed) {
      const low = evaluate(o, tax, 30).netPerWeekAll;
      out.push({ severity: "info", title: `${o.label}: no hours guarantee`, detail: `If 30% of scheduled shifts are cancelled, take-home falls from $${money(r.netPerWeekAll)} to $${money(low)} a week averaged over the contract and the gap${o.prorate ? ", because the stipends are also cut" : ""}. Ask for the guarantee and the stipend proration in writing.` });
    }
    if (o.gap > 0) {
      out.push({ severity: "info", title: `${o.label}: ${o.gap} unpaid week${o.gap === 1 ? "" : "s"} after the contract`, detail: `The gap lowers the weekly average from $${money(r.netPerWeekWorking)} while working to $${money(r.netPerWeekAll)} across the whole period.` });
    }
  });
  return out;
}

export function analyze(input) {
  const tax = parseTax(input);
  if (tax.error) return { error: tax.error };
  const offers = [];
  const rawOffers = (input.offers || []).slice(0, MAX_OFFERS);
  if (rawOffers.length < 1) return { error: "Add at least one offer." };
  for (let i = 0; i < rawOffers.length; i++) {
    const o = parseOffer(rawOffers[i], `Offer ${String.fromCharCode(65 + i)}`);
    if (o.error) return { error: o.error };
    offers.push(o);
  }
  const results = offers.map((o) => evaluate(o, tax));
  const best = results.reduce((bi, r, i) => (r.netPerWeekAll > results[bi].netPerWeekAll ? i : bi), 0);
  const sensitivity = offers.map((o) => CANCEL_STEPS.map((c) => evaluate(o, tax, c).netPerWeekAll));
  const needed = offers.map((o, i) => (i === best ? null : rateToMatch(o, tax, results[best].netPerWeekAll)));
  return { tax, offers, results, best, sensitivity, needed, findings: findings(offers, results, tax, best) };
}

export function sampleInput() {
  return {
    taxRate: "20",
    taxHome: "yes",
    offers: [
      { name: "Agency A: stipend heavy", rate: "24", hours: "36", weeks: "13", otHours: "0", otMult: "1.5", housing: "1450", mie: "560", bonus: "1000", travel: "700", housingCost: "1150", travelCost: "450", premium: "85", gap: "2", cancel: "10", guaranteed: "yes", prorate: "no", gsaLodging: "", gsaMie: "" },
      { name: "Agency B: taxable heavy", rate: "60", hours: "36", weeks: "13", otHours: "0", otMult: "1.5", housing: "350", mie: "150", bonus: "0", travel: "500", housingCost: "1150", travelCost: "450", premium: "40", gap: "2", cancel: "10", guaranteed: "no", prorate: "yes", gsaLodging: "", gsaMie: "" },
      { name: "Staff job at home", rate: "47", hours: "36", weeks: "52", otHours: "0", otMult: "1.5", housing: "0", mie: "0", bonus: "0", travel: "0", housingCost: "0", travelCost: "0", premium: "70", gap: "0", cancel: "0", guaranteed: "yes", prorate: "no", gsaLodging: "", gsaMie: "" },
    ],
  };
}

export function reportCsv(a) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const rows = [["Offer", "Weekly gross", "Contract gross", "Taxes", "Costs", "Take-home", "Weeks incl gap", "Take-home per week (whole period)", "Take-home per year"]];
  a.offers.forEach((o, i) => {
    const r = a.results[i];
    rows.push([q(o.label), r.grossWeekly.toFixed(2), r.gross.toFixed(2), r.taxes.toFixed(2), r.costs.toFixed(2), r.net.toFixed(2), r.span, r.netPerWeekAll.toFixed(2), r.netPerYear.toFixed(2)]);
  });
  rows.push([]);
  rows.push(["Take-home per week by share of shifts cancelled", ...CANCEL_STEPS.map((c) => c + "%")]);
  a.offers.forEach((o, i) => rows.push([q(o.label), ...a.sensitivity[i].map((v) => v.toFixed(2))]));
  return rows.map((r) => r.join(",")).join("\n") + "\n";
}
