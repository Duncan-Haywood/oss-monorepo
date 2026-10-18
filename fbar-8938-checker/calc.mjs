// FBAR (FinCEN Form 114) and Form 8938 (FATCA) filing checker. Pure functions, nothing leaves the browser.
//
// FBAR: a US person with a financial interest in, or signature authority over, foreign financial accounts must file if the
//   AGGREGATE of the highest value of each account during the year exceeded $10,000 (each converted at the Treasury
//   year-end rate). Due April 15, automatically extended to October 15. Filed on FinCEN's BSA E-Filing site, not with the return.
// Form 8938: filed WITH the income tax return when specified foreign financial assets exceed a threshold that depends on
//   filing status and whether you live abroad. Two tests: the last day of the year, and the highest at any time in the year.
// Thresholds and the per-asset reportability table are data so the page can be corrected without a logic change.

export const FBAR_THRESHOLD = 10000;

// [year-end, any-time] in USD.
export const FORM_8938_THRESHOLDS = {
  us: { single: [50000, 75000], mfs: [50000, 75000], mfj: [100000, 150000] },
  abroad: { single: [200000, 300000], mfs: [200000, 300000], mfj: [400000, 600000] },
};

// Where each kind of asset lands. fbar: counts toward the FBAR $10,000 aggregate. f8938: counts toward Form 8938.
export const KINDS = {
  bank: { label: "Bank or savings account", fbar: true, f8938: true },
  brokerage: { label: "Brokerage or investment account", fbar: true, f8938: true },
  fund: { label: "Foreign mutual fund / pooled fund", fbar: true, f8938: true },
  pension: { label: "Foreign pension / retirement account", fbar: true, f8938: true },
  insurance: { label: "Life insurance with cash value", fbar: true, f8938: true },
  stock: { label: "Foreign stock or bond held directly (not in an account)", fbar: false, f8938: true },
  entity: { label: "Interest in a foreign company, partnership or trust", fbar: false, f8938: true },
};

export const DEFAULTS = {
  filingStatus: "single",
  livesAbroad: "no",
  signatureOnly: 0,
};

export const EXAMPLE_ASSETS = [
  { name: "UK current account", kind: "bank", maxLocal: 6200, endLocal: 4100, rate: 1.27 },
  { name: "UK ISA", kind: "brokerage", maxLocal: 18000, endLocal: 17000, rate: 1.27 },
  { name: "Indian mutual fund", kind: "fund", maxLocal: 900000, endLocal: 850000, rate: 0.012 },
];

export const num = (s) => {
  if (typeof s === "number") return s;
  const t = String(s ?? "").replace(/[$,%\s]/g, "");
  return t === "" ? NaN : Number(t);
};
export const money = (x) => `${x < 0 ? "-" : ""}$${Math.abs(Math.round(x)).toLocaleString("en-US")}`;

function toUsd(a) {
  const rate = Number.isFinite(a.rate) && a.rate > 0 ? a.rate : 1;
  const max = Math.max(a.maxLocal || 0, a.endLocal || 0); // the highest value can never be below the year-end value
  return { ...a, rate, maxUsd: max * rate, endUsd: (a.endLocal || 0) * rate };
}

export function analyze(rawAssets, rawOpts) {
  const o = { ...DEFAULTS, ...rawOpts };
  const warnings = [];
  if (!(o.filingStatus in FORM_8938_THRESHOLDS.us)) warnings.push("Pick a filing status.");
  const assets = [];
  for (const a of rawAssets || []) {
    if (!(a.kind in KINDS)) { warnings.push(`"${a.name || "An asset"}": pick what kind of asset it is.`); continue; }
    if (![a.maxLocal, a.endLocal].every((v) => Number.isFinite(v) && v >= 0)) { warnings.push(`"${a.name || "An asset"}": values must be numbers, zero or more.`); continue; }
    if (a.rate !== undefined && !(Number.isFinite(a.rate) && a.rate > 0)) { warnings.push(`"${a.name || "An asset"}": the exchange rate must be above zero.`); continue; }
    assets.push(toUsd(a));
  }
  if (warnings.length) return { opts: o, warnings, result: null };

  const fbarAssets = assets.filter((a) => KINDS[a.kind].fbar);
  // Signature-authority-only accounts (e.g. an employer's account you can sign on, no personal interest) count for the FBAR only.
  const sigOnly = o.signatureOnly || 0;
  const fbarTotal = fbarAssets.reduce((s, a) => s + a.maxUsd, 0) + sigOnly;
  const fbarRequired = fbarTotal > FBAR_THRESHOLD;

  const place = o.livesAbroad === "yes" ? "abroad" : "us";
  const [endLimit, anyLimit] = FORM_8938_THRESHOLDS[place][o.filingStatus];
  const f8938Assets = assets.filter((a) => KINDS[a.kind].f8938);
  const endTotal = f8938Assets.reduce((s, a) => s + a.endUsd, 0);
  // The any-time test sums each asset's own peak. That overstates the true simultaneous peak, so it is a ceiling:
  // flagged when the ceiling crosses the limit AND the year-end test does not already decide it.
  const anyCeiling = f8938Assets.reduce((s, a) => s + a.maxUsd, 0);
  const f8938Required = endTotal > endLimit || anyCeiling > anyLimit;
  const f8938Maybe = !f8938Required ? false : endTotal <= endLimit; // required only by the any-time ceiling

  const bothOnly = (fn) => assets.filter(fn).length;
  return {
    opts: o, warnings, result: {
      assets,
      fbar: { total: fbarTotal, threshold: FBAR_THRESHOLD, required: fbarRequired, headroom: Math.max(0, FBAR_THRESHOLD - fbarTotal), count: fbarAssets.length + (sigOnly > 0 ? 1 : 0) },
      f8938: { endTotal, anyCeiling, endLimit, anyLimit, required: f8938Required, onlyByAnyTime: f8938Maybe, place, count: f8938Assets.length },
      fbarOnlyCount: bothOnly((a) => KINDS[a.kind].fbar && !KINDS[a.kind].f8938),
      f8938OnlyCount: bothOnly((a) => KINDS[a.kind].f8938 && !KINDS[a.kind].fbar),
    },
  };
}

export function toCsv(a) {
  const r = a.result;
  const rows = [["asset", "kind", "highest_usd", "year_end_usd", "counts_for_fbar", "counts_for_8938"],
    ...r.assets.map((x) => [String(x.name || "").replace(/,/g, " "), x.kind, x.maxUsd.toFixed(2), x.endUsd.toFixed(2), KINDS[x.kind].fbar ? "yes" : "no", KINDS[x.kind].f8938 ? "yes" : "no"]),
    ["FBAR aggregate", "", r.fbar.total.toFixed(2), "", r.fbar.required ? "FILE" : "not required", ""],
    ["Form 8938 year-end total", "", "", r.f8938.endTotal.toFixed(2), "", r.f8938.required ? "FILE" : "not required"]];
  return rows.map((x) => x.join(",")).join("\n") + "\n";
}
