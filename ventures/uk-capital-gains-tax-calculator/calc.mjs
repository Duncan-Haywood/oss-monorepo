// UK Capital Gains Tax on a disposal (shares, funds, crypto, second homes, other assets) for 2025/26 and 2026/27.
// Pure functions, no I/O. Bad input is rejected with a message, never clamped.
// Written from memory WITHOUT network access in the building session. Modelled for 2025/26: annual exempt amount GBP 3,000; rates 18% within the
// unused basic-rate band and 24% above it, for residential property and all other assets alike (rates aligned from 30 October 2024). The
// basic-rate band is GBP 37,700 of taxable income (income above the personal allowance); the allowance is GBP 12,570, withdrawn GBP 1 for every GBP 2
// of income over GBP 100,000. Current-year losses are set against gains first; losses brought forward only reduce gains down to the exempt amount.
// Business Asset Disposal Relief, Scottish bands, pension/Gift Aid band extensions, split-year residence and the non-dom regime are NOT modelled.
// Every result names its source to verify.

export const VERIFY = "GOV.UK 'Capital Gains Tax rates and allowances' and 'Capital Gains Tax: what you pay it on, rates and allowances'; Taxation of Chargeable Gains Act 1992";
export const AEA = 3000;
export const BASIC_BAND = 37700;
export const ALLOWANCE = 12570;
export const TAPER_FROM = 100000;
export const LOW_RATE = 0.18;
export const HIGH_RATE = 0.24;
// 2026/27 has the same exempt amount, rates, allowance and band as 2025/26 (GOV.UK "Capital Gains Tax rates and allowances", checked 2026-10-28).
export const YEARS = { 2025: "2025/26", 2026: "2026/27" };

const money = (n) => (n < 0 ? "-" : "") + "GBP " + Number(Math.round(Math.abs(n) * 100) / 100).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const r2 = (n) => Math.round(n * 100) / 100;

export function parse(input) {
  const i = input || {};
  const errors = [];
  const num = (key, label, optional) => {
    const v = i[key];
    if (v === undefined || v === null || v === "") { if (!optional) errors.push(`Enter ${label}.`); return 0; }
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) { errors.push(`Enter ${label} as zero or more.`); return 0; }
    return n;
  };
  const proceeds = num("proceeds", "the sale proceeds");
  const cost = num("cost", "what the asset cost you");
  const costs = num("costs", "allowable buying, selling and improvement costs (zero if none)", true);
  const other = num("other", "other gains in the same tax year (zero if none)", true);
  const lossNow = num("lossNow", "losses made in the same tax year (zero if none)", true);
  const lossBf = num("lossBf", "losses brought forward from earlier years (zero if none)", true);
  const income = num("income", "your total income for the year before the personal allowance, excluding this gain");
  const year = Number(i.year);
  if (!YEARS[year]) errors.push("Pick the tax year.");
  const type = i.type === "property" ? "property" : "other";
  return { errors, proceeds, cost, costs, other, lossNow, lossBf, income, year, type };
}

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const { proceeds, cost, costs, other, lossNow, lossBf, income, year, type } = p;
  const label = YEARS[year];
  const gain = r2(proceeds - cost - costs);
  const net = r2(gain + other - lossNow);
  const findings = [];
  const obligations = [];

  const allowance = income <= TAPER_FROM ? ALLOWANCE : Math.max(0, ALLOWANCE - Math.floor((income - TAPER_FROM) / 2));
  const taxableIncome = r2(Math.max(0, income - allowance));
  const bandLeft = r2(Math.max(0, BASIC_BAND - taxableIncome));

  let lossUsed = 0, aeaUsed = 0, taxable = 0, lossCarried = 0;
  if (net <= 0) {
    lossCarried = r2(-net);
  } else {
    lossUsed = r2(Math.min(lossBf, Math.max(0, net - AEA)));
    const after = r2(net - lossUsed);
    aeaUsed = r2(Math.min(AEA, after));
    taxable = r2(after - aeaUsed);
  }
  const atLow = r2(Math.min(taxable, bandLeft));
  const atHigh = r2(taxable - atLow);
  const taxLow = r2(atLow * LOW_RATE);
  const taxHigh = r2(atHigh * HIGH_RATE);
  const tax = r2(taxLow + taxHigh);
  const lossAfter = r2(lossBf - lossUsed + lossCarried);
  const effective = net > 0 ? r2((tax / net) * 100) : 0;

  if (net <= 0) {
    findings.push({ severity: "info", title: `Net result for ${label} is a loss of ${money(-net)} (or nil): no Capital Gains Tax. Report the loss to HMRC to carry it forward; unreported losses can be refused later.` });
  } else if (tax === 0) {
    findings.push({ severity: "info", title: `Net gains of ${money(net)} are covered by the ${money(AEA)} annual exempt amount${lossUsed ? ` and ${money(lossUsed)} of brought-forward losses` : ""}: no Capital Gains Tax.` });
  } else {
    findings.push({ severity: "high", title: `Capital Gains Tax for ${label}: ${money(tax)} on ${money(taxable)} of taxable gain, an effective ${effective}% of the net gain.` });
    findings.push({ severity: "medium", title: `${atLow ? `${money(atLow)} at ${LOW_RATE * 100}% (${money(taxLow)})` : ""}${atLow && atHigh ? " and " : ""}${atHigh ? `${money(atHigh)} at ${HIGH_RATE * 100}% (${money(taxHigh)})` : ""}. Your unused basic-rate band for gains was ${money(bandLeft)} (${money(BASIC_BAND)} less your ${money(taxableIncome)} of taxable income).` });
  }
  if (net > 0 && lossUsed) findings.push({ severity: "info", title: `Brought-forward losses are used only to bring gains down to the ${money(AEA)} exempt amount: ${money(lossUsed)} used, ${money(lossAfter)} left to carry forward.` });
  if (net > 0 && atHigh > 0 && bandLeft > 0) findings.push({ severity: "medium", title: `Only ${money(bandLeft)} of gains fall in the 18% band. Spreading a sale across two tax years, or having a spouse or civil partner own part of the asset before sale, can use a second allowance and band; transfers between spouses are no-gain-no-loss.` });
  if (net > 0 && tax > 0 && other === 0 && lossNow === 0) findings.push({ severity: "info", title: `You keep ${money(r2(proceeds - costs - tax))} of the ${money(proceeds)} proceeds after costs and tax (before repaying any loan on the asset).` });
  findings.push({ severity: "info", title: "Not modelled: Business Asset Disposal Relief, Scottish bands, pension and Gift Aid extending the basic-rate band, split-year residence, main-home relief and foreign gains. Check these with HMRC or an accountant if they apply." });

  if (tax > 0 || net <= 0) {
    if (type === "property" && net > 0) obligations.push({ ref: "60", title: "UK residential property: report and pay within 60 days", why: "A UK residential property disposal with tax due must be reported to HMRC and the tax paid within 60 days of completion, in addition to the Self Assessment return." });
    obligations.push({ ref: "SA", title: "Report on your Self Assessment return", why: `Disposals in ${label} go on the return due 31 January after the tax year ends. You must report if gains are over the exempt amount or total proceeds are over 50,000, even if no tax is due.` });
    obligations.push({ ref: "Records", title: "Keep records", why: "Keep dates, prices, fees and improvement receipts for at least the period HMRC may enquire. Shares in the same company are pooled, which changes the cost figure." });
  }
  return { errors: [], label, type, gain, net, lossUsed, lossCarried, lossAfter, aeaUsed, taxable, allowance, taxableIncome, bandLeft, atLow, atHigh, taxLow, taxHigh, tax, effective, findings, obligations, proceeds, cost, costs, other, lossNow, lossBf, income };
}

export const SAMPLE = { year: 2026, type: "other", proceeds: 40000, cost: 15000, costs: 500, other: 0, lossNow: 0, lossBf: 0, income: 50000 };

export function summaryText(r) {
  const L = [`UK Capital Gains Tax, ${r.label}`, "", `Gain on this disposal: ${money(r.gain)}`, `Net gains for the year: ${money(r.net)}`, `Annual exempt amount used: ${money(r.aeaUsed)}`, `Losses brought forward used: ${money(r.lossUsed)}`, `Taxable gain: ${money(r.taxable)}`, ""];
  L.push(`At 18%: ${money(r.atLow)} = ${money(r.taxLow)}`, `At 24%: ${money(r.atHigh)} = ${money(r.taxHigh)}`, `Capital Gains Tax: ${money(r.tax)}`);
  L.push("", ...r.findings.map((f) => `- ${f.title}`), "", ...r.obligations.map((o) => `- ${o.title}: ${o.why}`), "", `Verify against: ${VERIFY}`, "Not tax advice. No warranty.");
  return L.join("\n");
}
