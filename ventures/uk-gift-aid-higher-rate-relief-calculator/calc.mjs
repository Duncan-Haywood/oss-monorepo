// UK Gift Aid: what a donation really costs a higher or additional rate
// taxpayer, what the charity receives, the relief you reclaim through Self
// Assessment, the carry-back election to the previous tax year, and the gift
// that wins back a tapered personal allowance. Browser-only. Not tax advice.

// Rates as understood for 2025/26 (England, Wales, NI; thresholds frozen).
// Verify on GOV.UK. Scottish rates are not modelled.
export const RATES = {
  pa: 12570,
  taperStart: 100000,
  basicBand: 37700,
  additionalThreshold: 125140,
  itBasic: 0.20,
  itHigher: 0.40,
  itAdditional: 0.45,
  giftAidRate: 0.25, // charity reclaims 25p per £1 given (20% of the grossed-up gift)
};

export const SAMPLE = { gift: "800", income: "70000", prevIncome: "" };

const FIELDS = ["gift", "income", "prevIncome"];
const round2 = (n) => Math.round(n * 100) / 100;
const money0 = (n) => "£" + Math.round(n).toLocaleString("en-GB");
const money2 = (n) => "£" + n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function personalAllowance(adjustedNetIncome) {
  if (adjustedNetIncome <= RATES.taperStart) return RATES.pa;
  return Math.max(0, RATES.pa - (adjustedNetIncome - RATES.taperStart) / 2);
}

// Income tax on non-savings income. `gross` is a grossed-up Gift Aid donation:
// it widens the basic-rate band and lowers adjusted net income for the
// personal allowance taper, but does not reduce taxable income itself.
export function incomeTax(income, gross = 0) {
  const allowance = personalAllowance(Math.max(0, income - gross));
  const taxable = Math.max(0, income - allowance);
  const band = RATES.basicBand + gross;
  const basic = Math.min(taxable, band);
  const top = RATES.additionalThreshold + gross; // the higher-rate band widens too
  const higher = Math.max(0, Math.min(taxable, top) - band);
  const additional = Math.max(0, taxable - top);
  return basic * RATES.itBasic + higher * RATES.itHigher + additional * RATES.itAdditional;
}

// Relief the donor reclaims on a donation of `net` (what they actually paid).
export function relief(net, income) {
  const gross = net / (1 - RATES.itBasic);
  const before = incomeTax(income);
  const after = incomeTax(income, gross);
  return { gross, relief: Math.max(0, before - after), taxBefore: before, taxAfter: after };
}

// Gross gift that brings adjusted net income back to £100,000.
export function trapGift(income) {
  if (income <= RATES.taperStart) return null;
  const gross = income - RATES.taperStart;
  return { gross, net: gross * (1 - RATES.itBasic) };
}

export function compute(raw) {
  const errors = [];
  const num = (k, label) => {
    const s = String(raw[k] ?? "").trim();
    const n = s === "" ? 0 : Number(s);
    if (!Number.isFinite(n) || n < 0) { errors.push(`${label} must be a number of 0 or more.`); return 0; }
    return n;
  };
  const labels = { gift: "Donation", income: "Your total taxable income", prevIncome: "Previous year's income" };
  const v = {};
  for (const k of FIELDS) v[k] = num(k, labels[k]);
  if (!errors.length && v.gift === 0) errors.push("Enter the amount you donated.");
  if (!errors.length && v.income === 0) errors.push("Enter your taxable income for the year.");
  if (errors.length) return { errors };

  const now = relief(v.gift, v.income);
  const gross = now.gross;
  const charityExtra = gross - v.gift;
  const costNow = v.gift - now.relief;
  const prev = v.prevIncome > 0 ? relief(v.gift, v.prevIncome) : null;
  const costPrev = prev ? v.gift - prev.relief : null;
  const carryBackBetter = prev && prev.relief > now.relief + 0.005;
  const best = carryBackBetter ? { which: "previous year", relief: prev.relief, cost: costPrev } : { which: "this year", relief: now.relief, cost: costNow };
  const costPerPound = best.cost / gross;
  const marginal = gross > 0 ? now.relief / gross : 0;

  const scenarios = [0.5, 1, 2, 5].map((m) => {
    const net = round2(v.gift * m);
    const r = relief(net, v.income);
    return { multiple: m, net, gross: round2(r.gross), relief: round2(r.relief), cost: round2(net - r.relief) };
  });

  const trap = trapGift(v.income);
  const trapInZone = v.income > RATES.taperStart && v.income < RATES.additionalThreshold;
  const trapRelief = trap ? relief(trap.net, v.income) : null;

  const findings = [];
  if (now.relief === 0 && !carryBackBetter) findings.push({ severity: "medium", title: "No extra relief for you: your income is within the basic rate band, so the 25% the charity claims is the whole benefit. The charity still receives the grossed-up amount if you made a Gift Aid declaration." });
  if (now.relief > 0) findings.push({ severity: "info", title: `Your £${v.gift.toLocaleString("en-GB")} gift becomes ${money2(gross)} for the charity. You reclaim ${money2(now.relief)}, so it costs you ${money2(costNow)}.` });
  if (marginal > 0.2501) findings.push({ severity: "high", title: `Part of this gift falls in the personal allowance taper band, where relief is worth more than 40%. Your effective relief is ${(marginal * 100).toFixed(1)}% of the gross gift.` });
  if (carryBackBetter) findings.push({ severity: "high", title: `Carrying the gift back to the previous tax year would give ${money2(prev.relief)} of relief, ${money2(prev.relief - now.relief)} more than this year. You must elect on or before filing the previous year's return, no later than 31 January after this tax year.` });
  if (prev && !carryBackBetter) findings.push({ severity: "info", title: `Carrying back would give ${money2(prev.relief)} of relief, which is not better than this year.` });
  if (trapInZone && trapRelief) findings.push({ severity: "high", title: `Your income is in the £100,000 to £125,140 band where you lose £1 of personal allowance per £2. A gross gift of ${money0(trap.gross)} (you give ${money0(trap.net)}) would restore the full allowance and give about ${money0(trapRelief.relief)} of relief, an effective ${((trapRelief.relief / trap.net) * 100).toFixed(0)}% of what you give.` });
  if (now.taxBefore < gross * RATES.itBasic) findings.push({ severity: "high", title: `Gift Aid assumes you paid at least ${money0(gross * RATES.itBasic)} of income tax or Capital Gains Tax. Your income tax looks to be only ${money0(now.taxBefore)}, so you may owe the difference to HMRC.` });

  const obligations = [
    { title: "Sign a Gift Aid declaration", why: "The charity can only claim its 25% if you have made a declaration, in writing or online, and are a UK taxpayer." },
    { title: "Claim your higher rate relief", why: "Enter the gross amount in the Gift Aid section of your Self Assessment return, or ask HMRC to change your tax code. The charity does not pass the relief to you." },
    { title: "Keep a record of the gift", why: "Keep the date, charity and amount. A carry-back election must be made on or before filing the previous year's return." },
    { title: "Check the rates", why: "Rates follow 2025/26 England, Wales and Northern Ireland bands and were entered from memory. Scottish rates are not modelled. Confirm on GOV.UK before you act." },
  ];

  return { errors: [], v, gross, charityExtra, now, prev, costNow, costPrev, carryBackBetter, best, costPerPound, marginal, scenarios, trap, trapInZone, trapRelief, findings, obligations };
}

export function summaryText(r) {
  return [
    "UK Gift Aid higher rate relief (2025/26)",
    `You give: ${money2(r.v.gift)}  Charity receives: ${money2(r.gross)} (${money2(r.charityExtra)} from Gift Aid)`,
    `Relief you reclaim this year: ${money2(r.now.relief)}  Net cost to you: ${money2(r.costNow)}`,
    r.prev ? `Relief if carried back: ${money2(r.prev.relief)} (net cost ${money2(r.costPrev)})` : "Carry-back not checked.",
    `Cost to you per £1 the charity receives: ${money2(r.costPerPound)}`,
    "Not tax advice. Verify rates on GOV.UK.",
  ].join("\n");
}
