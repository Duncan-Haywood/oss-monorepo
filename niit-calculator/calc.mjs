// Net Investment Income Tax (NIIT, IRC section 1411, Form 8960). Pure functions, nothing leaves the browser.
//
// NIIT = 3.8% x the LESSER of:
//   (a) net investment income (NII), and
//   (b) modified AGI over the filing-status threshold.
// Thresholds are statutory and NOT indexed for inflation: $200,000 single / head of household,
// $250,000 married filing jointly / qualifying surviving spouse, $125,000 married filing separately.
// Tax-year figures are inputs so the page can be corrected without a code change.

export const RATE = 0.038;
export const THRESHOLDS = { single: 200000, hoh: 200000, mfj: 250000, qss: 250000, mfs: 125000 };

export const DEFAULTS = {
  filingStatus: "single",
  wages: 180000,
  businessIncome: 0,
  interest: 2000,
  dividends: 6000,
  shortTermGains: 0,
  longTermGains: 60000,
  rentalIncome: 0,
  annuityIncome: 0,
  otherNii: 0,
  investmentExpenses: 0,
  otherMagiAdjust: 0,
  threshold: 200000,
  extraGain: 25000,
};

export const num = (s) => {
  if (typeof s === "number") return s;
  const t = String(s ?? "").replace(/[$,%\s]/g, "");
  return t === "" ? NaN : Number(t);
};
export const money = (x) => `${x < 0 ? "-" : ""}$${Math.abs(Math.round(x)).toLocaleString("en-US")}`;
export const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;

// Net investment income: interest, dividends, net gains (a net capital loss is limited to $3,000 on Form 8960 line 5 via
// the 1040 loss limit, which the user types as an already-limited number), passive rental/royalty income, annuities and
// other NII, less allocable deductions. Never below zero.
export function netInvestmentIncome(o) {
  const gains = o.shortTermGains + o.longTermGains;
  const gross = o.interest + o.dividends + gains + o.rentalIncome + o.annuityIncome + o.otherNii;
  return Math.max(0, gross - o.investmentExpenses);
}

// MAGI for NIIT: wages + business income + all investment income as typed (before the allocable-expense deduction,
// which is a deduction of NII only) + any other adjustment the user types (e.g. an above-the-line deduction, as a negative).
export function magi(o) {
  const gains = o.shortTermGains + o.longTermGains;
  return o.wages + o.businessIncome + o.interest + o.dividends + gains + o.rentalIncome + o.annuityIncome + o.otherNii + o.otherMagiAdjust;
}

export function niit(o) {
  const nii = netInvestmentIncome(o);
  const m = magi(o);
  const over = Math.max(0, m - o.threshold);
  const base = Math.min(nii, over);
  return { nii, magi: m, over, base, tax: base * RATE, limitedBy: over < nii ? "magi" : "nii" };
}

// The marginal cost of one more dollar of gain: 3.8% while MAGI-over is the binding limit (the dollar adds to both
// MAGI and NII, so the tax rises by the full 3.8%), and also 3.8% when NII binds. It only reads 0% when you are
// already below the threshold by more than the extra gain. Compute it exactly by differencing.
export function marginalNiit(o, extra) {
  const a = niit(o).tax;
  const b = niit({ ...o, longTermGains: o.longTermGains + extra }).tax;
  return { extra, added: b - a, effective: extra > 0 ? (b - a) / extra : 0 };
}

export function analyze(raw) {
  const o = { ...DEFAULTS, ...raw };
  const warnings = [];
  if (!(o.filingStatus in THRESHOLDS)) warnings.push("Pick a filing status.");
  for (const k of ["wages", "interest", "dividends", "rentalIncome", "annuityIncome", "otherNii", "investmentExpenses", "threshold", "extraGain"]) {
    if (!Number.isFinite(o[k])) warnings.push(`${k} must be a number.`);
    else if (o[k] < 0 && k !== "rentalIncome" && k !== "otherNii") warnings.push(`${k} cannot be negative.`);
  }
  if (warnings.length) return { opts: o, warnings, result: null };
  const r = niit(o);
  const headroom = Math.max(0, o.threshold - r.magi); // room below the threshold
  const cut = Math.min(r.over, r.nii) > 0 ? r.over : 0; // MAGI reduction that would remove the tax entirely
  // Realization sensitivity: what an extra gain does to the tax.
  const grid = [0, 0.5, 1, 2].map((m) => marginalNiit(o, o.extraGain * m));
  // Splitting a gain across two years: the same total gain halved lands each year below, or less far over, the threshold.
  const extra = o.extraGain;
  const oneYear = niit({ ...o, longTermGains: o.longTermGains + extra }).tax;
  const twoYears = 2 * niit({ ...o, longTermGains: o.longTermGains + extra / 2 }).tax - niit(o).tax; // second year assumed identical to this one
  // Levers: each is the tax change from reducing MAGI by $10,000 (e.g. a pre-tax 401(k)/HSA/IRA contribution, a charitable
  // QCD, harvested losses).
  const lever = r.tax - niit({ ...o, otherMagiAdjust: o.otherMagiAdjust - 10000 }).tax;
  const lossLever = r.tax - niit({ ...o, longTermGains: o.longTermGains - 10000 }).tax;
  const form = [
    ["Line 1 taxable interest", o.interest], ["Line 2 ordinary dividends", o.dividends],
    ["Line 5a net gain", o.shortTermGains + o.longTermGains], ["Line 4a rental, royalty (passive)", o.rentalIncome],
    ["Line 4a annuities and other", o.annuityIncome + o.otherNii], ["Line 9 investment expenses", -o.investmentExpenses],
    ["Line 12 net investment income", r.nii], ["Line 13 modified AGI", r.magi], ["Line 14 threshold", o.threshold],
    ["Line 15 MAGI over threshold", r.over], ["Line 16 smaller of 12 and 15", r.base], ["Line 17 NIIT (3.8%)", r.tax],
  ];
  return {
    opts: o, warnings, result: r, headroom, cutToZero: cut, grid, oneYear, twoYears,
    splitSaves: oneYear - twoYears, tenKMagiLever: lever, tenKGainLever: lossLever, form,
    belowThreshold: r.magi <= o.threshold,
  };
}

export function toCsv(a) {
  const rows = [["form_8960_line", "usd"], ...a.form.map(([k, v]) => [k.replace(/,/g, ""), Number(v).toFixed(2)])];
  return rows.map((x) => x.join(",")).join("\n") + "\n";
}
