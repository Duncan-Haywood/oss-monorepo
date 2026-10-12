// Net unrealized appreciation (NUA) on employer stock held in a 401(k):
// take the shares out in kind in a lump-sum distribution, or roll everything to an IRA.
// Arithmetic on the user's own figures; rules per IRC 402(e)(4) and IRS Pub. 575.

const num = (v) => {
  if (v === "" || v == null) return null;
  const n = Number(String(v).replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const round2 = (n) => Math.round(n * 100) / 100;

export const dollars = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(Math.round(n)).toLocaleString("en-US");
export const pctText = (n) => `${Math.round(n * 10) / 10}%`;

export const SAMPLE = {
  value: 500000, basis: 100000, age: 56, separatedAt55: "yes", lumpSum: "yes",
  ordinaryPct: 32, ltcgPct: 15, retirementPct: 24, statePct: 0,
  growthPct: 5, years: 5, taxFundPct: 5,
};

// Everything the user typed, validated. Returns { errors, input }.
export function parse(raw) {
  const errors = [];
  const need = (k, label, min = 0, max = Infinity) => {
    const n = num(raw[k]);
    if (n == null || n < min || n > max) { errors.push(`${label} must be a number${max < Infinity ? ` between ${min} and ${max}` : min ? ` of at least ${min}` : ""}.`); return 0; }
    return n;
  };
  const input = {
    value: need("value", "Market value of the employer stock"),
    basis: need("basis", "Cost basis of the employer stock"),
    age: need("age", "Your age", 18, 110),
    ordinaryPct: need("ordinaryPct", "Ordinary tax rate now", 0, 60),
    ltcgPct: need("ltcgPct", "Long-term capital gains rate", 0, 40),
    retirementPct: need("retirementPct", "Ordinary tax rate on IRA withdrawals", 0, 60),
    statePct: num(raw.statePct) ?? 0,
    growthPct: num(raw.growthPct) ?? 0,
    years: need("years", "Years you would hold", 0, 60),
    taxFundPct: num(raw.taxFundPct) ?? num(raw.growthPct) ?? 0,
    separatedAt55: raw.separatedAt55 === "yes",
    lumpSum: raw.lumpSum !== "no",
  };
  if (input.basis > input.value && !errors.length) errors.push("Cost basis is above market value, so there is no net unrealized appreciation. Rolling over or selling inside the plan is the usual route; this tool has nothing to compare.");
  return { errors, input };
}

// One scenario at a given value/basis. All figures are dollars at the end of the holding period.
export function scenario(i) {
  const { value, basis } = i;
  const nua = Math.max(0, value - basis);
  const ord = i.ordinaryPct / 100, ltcg = i.ltcgPct / 100, ret = i.retirementPct / 100, st = i.statePct / 100;
  const g = i.growthPct / 100, n = i.years, fund = i.taxFundPct / 100;

  // The 10% additional tax applies to the basis that is taxed now when under 59.5,
  // unless the plan-separation-at-55 exception applies.
  const penaltyApplies = i.age < 59.5 && !(i.separatedAt55 && i.age >= 55);
  const taxNow = round2(basis * (ord + st) + (penaltyApplies ? basis * 0.1 : 0));

  const finalValue = value * Math.pow(1 + g, n);
  const growth = Math.max(0, finalValue - value);
  // Gain after distribution is long term only if held over a year; NUA is always long term.
  const growthRate = n > 1 ? ltcg : ord;
  const saleTax = round2(nua * (ltcg + st) + growth * (growthRate + st));
  // Opportunity cost: the tax paid now comes from money that would otherwise have grown.
  const taxNowAtHorizon = round2(taxNow * Math.pow(1 + fund, n));
  const nuaNet = round2(finalValue - saleTax - taxNowAtHorizon);

  // Roll to an IRA: nothing now, everything ordinary on the way out.
  const iraNet = round2(finalValue * (1 - ret - st));
  return { nua, taxNow, penaltyApplies, finalValue: round2(finalValue), saleTax, taxNowAtHorizon, nuaNet, iraNet, advantage: round2(nuaNet - iraNet) };
}

// Sensitivity: how the NUA advantage moves with the share of value that is basis.
export function sweep(i) {
  const out = [];
  for (const share of [10, 25, 40, 55, 70, 85]) {
    const s = scenario({ ...i, basis: i.value * share / 100 });
    out.push({ basisShare: share, advantage: s.advantage, nuaNet: s.nuaNet, iraNet: s.iraNet });
  }
  return out;
}

export function findings(i, s) {
  const f = [];
  const add = (severity, title) => f.push({ severity, title });
  if (!i.lumpSum) add("high", "NUA treatment needs a lump-sum distribution: the entire balance of every plan of the same type paid out within one calendar year after a triggering event (separation, age 59½, disability or death). A partial distribution generally loses NUA treatment, so confirm this with the plan before moving anything.");
  if (s.penaltyApplies) add("high", `You are under 59½ and not covered by the separation-at-55 exception, so the cost basis taxed now also carries a 10% additional tax (${dollars(i.basis * 0.1)}).`);
  if (s.advantage <= 0) add("high", `On these figures a rollover leaves you ahead of the NUA route by ${dollars(-s.advantage)}. A small gap between ordinary and capital-gains rates, a high basis share or a short hold all shrink the NUA benefit.`);
  else add("info", `On these figures the NUA route leaves you ahead of a rollover by ${dollars(s.advantage)} after ${i.years} year(s).`);
  const share = i.value ? (i.basis / i.value) * 100 : 0;
  if (share > 70) add("medium", `Cost basis is ${pctText(share)} of value. NUA planning is usually worth a look when the basis is a small share of value; with this much basis the tax you pay now is most of the picture.`);
  if (i.ordinaryPct - i.ltcgPct < 10) add("medium", "Your ordinary and long-term capital gains rates are less than 10 points apart, which is where NUA saves least.");
  add("medium", "Holding one company's stock after the distribution is a concentration risk. The tax result above says nothing about whether the stock is a good holding; selling right away still keeps the NUA at capital-gains rates.");
  add("info", "Not modelled: net investment income tax on post-distribution gains, state rules that differ from federal, IRMAA, the effect of the extra income on your bracket, required minimum distributions, estate and step-up rules, and plan-specific terms. Use your actual cost basis from the plan statement, not the purchase price of shares bought outside it.");
  return f;
}

export function compute(raw) {
  const { errors, input } = parse(raw);
  if (errors.length) return { errors, findings: [], input };
  const s = scenario(input);
  return { errors, input, s, sweep: sweep(input), findings: findings(input, s) };
}

export function summaryText(r) {
  const { input: i, s } = r;
  return [
    "NUA vs IRA rollover (worksheet, not advice)",
    `Employer stock value ${dollars(i.value)}, cost basis ${dollars(i.basis)}, NUA ${dollars(s.nua)}`,
    `NUA route: tax now on basis ${dollars(s.taxNow)}; sale tax at the end ${dollars(s.saleTax)}; net after ${i.years} year(s) ${dollars(s.nuaNet)}`,
    `IRA rollover: net after ${i.years} year(s) ${dollars(s.iraNet)}`,
    `Difference (NUA minus rollover): ${dollars(s.advantage)}`,
    "", ...r.findings.map((f) => `- [${f.severity}] ${f.title}`),
  ].join("\n");
}

export function sweepCsv(r) {
  return ["basis_share_pct,nua_net,ira_net,advantage", ...r.sweep.map((x) => [x.basisShare, x.nuaNet, x.iraNet, x.advantage].join(","))].join("\n") + "\n";
}
