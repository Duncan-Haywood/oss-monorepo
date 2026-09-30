// Home sale and the section 121 exclusion: how much of the gain on selling a main home is
// tax-free, what the rest costs, and what waiting to meet the two-year test would save.
// Deterministic and local. Tax year 2026 parameters; the page says to check them.

export const TAX_YEAR = 2026;
export const STATUSES = { single: "Single", mfj: "Married filing jointly", hoh: "Head of household", widow: "Surviving spouse (sale within 2 years of spouse's death)" };
export const EXCLUSION = { single: 250000, mfj: 500000, hoh: 250000, widow: 500000 };
export const NIIT_THRESHOLD = { single: 200000, mfj: 250000, hoh: 200000, widow: 250000 };
export const NIIT_RATE = 0.038;
export const STANDARD_DEDUCTION = { single: 16100, mfj: 32200, hoh: 24150, widow: 32200 };
const BRACKETS = {
  single: [[12400, 0.1], [50400, 0.12], [105700, 0.22], [201775, 0.24], [256225, 0.32], [640600, 0.35], [Infinity, 0.37]],
  mfj: [[24800, 0.1], [100800, 0.12], [211400, 0.22], [403550, 0.24], [512450, 0.32], [768700, 0.35], [Infinity, 0.37]],
  hoh: [[17700, 0.1], [67450, 0.12], [105700, 0.22], [201750, 0.24], [256200, 0.32], [640600, 0.35], [Infinity, 0.37]],
};
BRACKETS.widow = BRACKETS.mfj;
export const LTCG_BANDS = { single: [49450, 545500], mfj: [98900, 613700], hoh: [66200, 579600], widow: [98900, 613700] };
export const RECAPTURE_CAP = 0.25;

export const round2 = (n) => Math.round(n * 100) / 100;
export const money = (n) => Math.round(n).toLocaleString("en-US");
export function parseNum(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  const s = String(v ?? "").replace(/[$,\s]/g, "");
  if (s === "") return NaN;
  return /^-?\d*\.?\d+$/.test(s) ? Number(s) : NaN;
}

export function regularTax(taxable, status) {
  let tax = 0, lower = 0;
  for (const [upper, rate] of BRACKETS[status]) {
    if (taxable > lower) tax += (Math.min(taxable, upper) - lower) * rate;
    lower = upper;
  }
  return tax;
}

// Federal tax on the sale: unrecaptured depreciation (ordinary rates, capped at 25%), then
// long-term gain stacked on the rest of income into the 0/15/20% bands, then the 3.8% NIIT.
export function saleTax(year, { recapture = 0, gain = 0 }) {
  const { status, income } = year;
  const ordBase = Math.max(0, income - STANDARD_DEDUCTION[status]);
  const withRecap = regularTax(ordBase + recapture, status) - regularTax(ordBase, status);
  const recapTax = Math.min(withRecap, RECAPTURE_CAP * recapture);
  const ord = ordBase + recapture;
  const [b0, b1] = LTCG_BANDS[status];
  const zero = Math.min(gain, Math.max(0, b0 - ord));
  const rem = gain - zero;
  const fifteen = Math.min(rem, Math.max(0, b1 - Math.max(ord, b0)));
  const twenty = rem - fifteen;
  const ltcgTax = 0.15 * fifteen + 0.2 * twenty;
  const magi = income + recapture + gain;
  const niit = NIIT_RATE * Math.max(0, Math.min(recapture + gain, magi - NIIT_THRESHOLD[status]));
  return { recapTax, ltcgTax, niit, total: recapTax + ltcgTax + niit };
}

// The exclusion allowed and the parts of the gain it cannot reach.
export function exclusionFor(p) {
  const { status, gain, depreciation, ownMonths, useMonths, nonqualMonths, partialReason, priorSaleWithin2Years } = p;
  const full = EXCLUSION[status];
  const met = ownMonths >= 24 && useMonths >= 24 && !priorSaleWithin2Years;
  let cap = 0, basis = "none";
  if (met) { cap = full; basis = "full"; }
  else if (partialReason) {
    const months = Math.min(ownMonths, useMonths);
    cap = full * Math.min(1, months / 24);
    basis = "partial";
  }
  // Gain after depreciation (which is never excludable) and the share earned in nonqualified use.
  const gainAfterDep = Math.max(0, gain - depreciation);
  const nonqualShare = ownMonths > 0 ? Math.min(1, nonqualMonths / ownMonths) : 0;
  const excludable = gainAfterDep * (1 - nonqualShare);
  const used = Math.min(cap, excludable);
  return { full, cap, basis, used, gainAfterDep, nonqualShare, nonqualGain: gainAfterDep * nonqualShare };
}

function evaluate(p, price) {
  const gain = price - p.sellingCosts - p.basis - p.improvements; // gain before depreciation
  const adjGain = gain + p.depreciation; // depreciation reduced basis, so it raises the gain
  const ex = exclusionFor({ ...p, gain: adjGain });
  const taxableGain = Math.max(0, adjGain - ex.used);
  const recapture = Math.min(p.depreciation, Math.max(0, adjGain));
  const ltcg = Math.max(0, taxableGain - recapture);
  const t = saleTax(p.year, { recapture, gain: ltcg });
  return { price, gain: adjGain, ...ex, taxableGain, recapture, ltcg, tax: t };
}

// Highest sale price with zero tax (search).
function breakevenPrice(p) {
  const zero = (x) => evaluate(p, x).tax.total <= 0.005;
  if (!zero(p.basis + p.improvements + p.sellingCosts)) return null;
  let lo = p.basis + p.improvements + p.sellingCosts, hi = lo + 1e6;
  while (zero(hi) && hi < 1e10) hi *= 2;
  for (let i = 0; i < 70; i++) { const m = (lo + hi) / 2; if (zero(m)) lo = m; else hi = m; }
  return lo;
}

function opt(v, dflt) { return String(v ?? "").trim() === "" ? dflt : parseNum(v); }

export function analyze(input) {
  const status = input.status;
  if (!EXCLUSION[status]) return { error: "Choose a filing status." };
  const income = parseNum(input.income);
  if (!(income >= 0)) return { error: "Enter your other 2026 income (wages, etc.) as a number; 0 is allowed." };
  const price = parseNum(input.price);
  if (!(price > 0)) return { error: "Enter the sale price, above zero." };
  const basis = parseNum(input.basis);
  if (!(basis >= 0)) return { error: "Enter what you paid for the home (0 or more)." };
  const improvements = opt(input.improvements, 0), sellingCosts = opt(input.sellingCosts, 0), depreciation = opt(input.depreciation, 0);
  for (const [v, n] of [[improvements, "Improvements"], [sellingCosts, "Selling costs"], [depreciation, "Depreciation claimed"]]) if (!(v >= 0)) return { error: `${n} must be a number, or blank.` };
  const ownMonths = parseNum(input.ownMonths), useMonths = parseNum(input.useMonths), nonqualMonths = opt(input.nonqualMonths, 0);
  if (!(ownMonths >= 0 && ownMonths <= 1200)) return { error: "Enter how many months you owned the home." };
  if (!(useMonths >= 0 && useMonths <= ownMonths)) return { error: "Months used as your main home cannot exceed months owned." };
  if (!(nonqualMonths >= 0 && nonqualMonths <= ownMonths)) return { error: "Months of nonqualified use cannot exceed months owned." };
  const partialReason = input.partial === "yes";
  const priorSaleWithin2Years = input.prior === "yes";

  const year = { status, income };
  const p = { status, year, basis, improvements, sellingCosts, depreciation, ownMonths, useMonths, nonqualMonths, partialReason, priorSaleWithin2Years };
  const r = evaluate(p, price);
  const noExclusion = evaluate({ ...p, partialReason: false, ownMonths: 0, useMonths: 0 }, price);
  const findings = [];
  const lead = r.taxableGain <= 0.5 ? `The whole $${money(Math.max(0, r.gain))} gain is inside the exclusion` : `$${money(r.used)} of the $${money(r.gain)} gain is tax-free; $${money(r.taxableGain)} is taxable`;
  findings.push({ severity: "info", title: lead, detail: `The exclusion for your filing status is up to $${money(r.full)}. ${r.basis === "full" ? "You meet the ownership and use tests." : r.basis === "partial" ? "You qualify only for a partial exclusion, prorated by months." : "You do not currently meet the two-year tests, so nothing is excluded."}` });
  let wait = null;
  if (r.basis !== "full" && !priorSaleWithin2Years) {
    const needMonths = Math.max(0, 24 - Math.min(ownMonths, useMonths));
    const later = evaluate({ ...p, ownMonths: ownMonths + needMonths, useMonths: useMonths + needMonths }, price);
    wait = { months: needMonths, tax: later.tax.total, saved: r.tax.total - later.tax.total };
    if (wait.saved > 0.5) findings.push({ severity: "medium", title: `Selling ${needMonths} month${needMonths === 1 ? "" : "s"} later would save about $${money(wait.saved)} of tax`, detail: `At the same price you would meet the two-year ownership and use tests, lifting the exclusion to $${money(r.full)}. Weigh that against carrying costs and the price risk of waiting.` });
  }
  if (priorSaleWithin2Years) findings.push({ severity: "medium", title: "A home sale in the last two years blocks a new full exclusion", detail: "The exclusion can generally be used once every two years. A partial exclusion may still be available for a qualifying reason." });
  if (r.nonqualGain > 0.5) findings.push({ severity: "medium", title: `$${money(r.nonqualGain)} of the gain is not excludable because of time the home was not your main home`, detail: "Time after 2008 as a rental or second home, before it became your main home, is allocated out of the exclusion by months." });
  if (depreciation > 0) findings.push({ severity: "medium", title: `$${money(r.recapture)} of depreciation is taxed even inside the exclusion`, detail: "Depreciation claimed for a home office or rental after May 6, 1997 is never excludable. It is taxed at your ordinary rate, capped at 25%." });
  if (r.tax.niit > 0.5) findings.push({ severity: "info", title: `About $${money(r.tax.niit)} of that tax is the 3.8% net investment income tax`, detail: "It applies to the taxable gain when your income including the gain passes the threshold for your filing status." });
  const be = breakevenPrice(p);
  if (be !== null && be < price) findings.push({ severity: "info", title: `You would owe no tax at a sale price up to about $${money(be)}`, detail: "That is the highest price at which the exclusion covers the whole gain, given the costs and basis you entered." });
  findings.push({ severity: "info", title: "Keep records of improvements and closing costs", detail: "Every documented improvement and selling cost lowers the gain dollar for dollar, and your exclusion may not cover a large gain in a hot market." });
  return { year: TAX_YEAR, status, price, r, noExclusion, wait, breakeven: be, findings, savedByExclusion: noExclusion.tax.total - r.tax.total };
}

export function sampleInput() {
  return { status: "single", income: "120000", price: "850000", sellingCosts: "51000", basis: "300000", improvements: "40000", depreciation: "", ownMonths: "180", useMonths: "180", nonqualMonths: "0", partial: "no", prior: "no" };
}

const csvCell = (v) => { let s = String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function reportCsv(a) {
  const r = a.r;
  const rows = [["Item", "Amount"], ["Sale price", round2(r.price)], ["Total gain", round2(r.gain)], ["Exclusion allowed", round2(r.used)], ["Taxable gain", round2(r.taxableGain)], ["Depreciation recapture", round2(r.recapture)], ["Long-term capital gain tax", round2(r.tax.ltcgTax)], ["Recapture tax", round2(r.tax.recapTax)], ["Net investment income tax", round2(r.tax.niit)], ["Estimated federal tax", round2(r.tax.total)], ["Tax without any exclusion", round2(a.noExclusion.tax.total)]];
  return rows.map((x) => x.map(csvCell).join(",")).join("\n") + "\n";
}
