// UK capital allowances: how much of this year's equipment spend you can deduct
// from profit (Annual Investment Allowance, full expensing, first-year
// allowances, writing-down allowances), the best way to allocate the AIA, and
// the tax it saves. Browser-only. Not tax advice.

// Rates for 2026/27, checked 2026-11-23 against GOV.UK ("Capital allowances: new
// first-year allowance and reducing main rate writing down allowances", Autumn
// Budget 2025): main-pool writing-down allowance 14% from 1 April 2026 (companies)
// and 6 April 2026 (income tax), was 18%; a 40% first-year allowance on new,
// unused main-rate plant and machinery (not cars) from 1 January 2026, open to
// unincorporated businesses. The later 12% / 50% change for April 2027 is not
// modelled. Under CAA 2001 s58(5) the balance left after any first-year allowance
// joins the pool only from the next period, so it gets no writing-down this year.
export const RATES = {
  year: "2026/27",
  aia: 1000000,
  mainWda: 0.14,
  specialWda: 0.06,
  fyaMain: 0.4,
  fyaSpecial: 0.5,
  smallPool: 1000,
};

export const SAMPLE = {
  entity: "company", months: "12", taxRate: "25", profit: "180000",
  mainNew: "60000", mainUsed: "8000", specialNew: "40000", specialUsed: "0",
  carMain: "30000", carSpecial: "0", mainBf: "20000", specialBf: "5000",
};

const FIELDS = ["mainNew", "mainUsed", "specialNew", "specialUsed", "carMain", "carSpecial", "mainBf", "specialBf"];
const round2 = (n) => Math.round(n * 100) / 100;
const money0 = (n) => "£" + Math.round(n).toLocaleString("en-GB");

// Deduction per £1 of spend in year 1 when no AIA is used on it.
function baseline(cat, isCompany) {
  const { mainWda, specialWda, fyaMain, fyaSpecial } = RATES;
  switch (cat) {
    case "mainNew": return isCompany ? 1 : fyaMain;
    case "mainUsed": return mainWda;
    case "specialNew": return isCompany ? fyaSpecial : specialWda;
    case "specialUsed": return specialWda;
    default: return 0;
  }
}
const POOL_OF = { mainNew: "main", mainUsed: "main", specialNew: "special", specialUsed: "special", carMain: "main", carSpecial: "special" };
const AIA_CATS = ["mainNew", "mainUsed", "specialNew", "specialUsed"];

// CAA 2001 s56(3) and s56A: the writing-down allowance and the small pools limit
// are proportionately increased or reduced for a period of more or less than a
// year (HMRC CA23225: a 17-month period has a £1,417 limit).
function poolWda(balance, rate, months) {
  if (balance <= 0) return 0;
  if (balance <= RATES.smallPool * months / 12) return balance;
  return round2(balance * rate * months / 12);
}

// order: categories in the order the AIA is applied.
function claim(v, order) {
  const isCompany = v.entity === "company";
  // s51A(6): the maximum AIA is proportionately increased or reduced (CA23085).
  let aia = RATES.aia * v.months / 12;
  const spend = {};
  for (const c of FIELDS) spend[c] = v[c];
  const aiaUsed = {};
  for (const c of order) {
    const used = Math.min(aia, spend[c]);
    aiaUsed[c] = used; aia -= used;
  }
  let fya = 0;
  const pool = { main: spend.mainBf, special: spend.specialBf };
  // s58(5): what a first-year allowance leaves joins the pool next period.
  const later = { main: 0, special: 0 };
  for (const c of ["mainNew", "mainUsed", "specialNew", "specialUsed", "carMain", "carSpecial"]) {
    let rest = spend[c] - (aiaUsed[c] || 0);
    const fyaRate = c === "mainNew" ? (isCompany ? 1 : RATES.fyaMain) : c === "specialNew" && isCompany ? RATES.fyaSpecial : 0;
    if (fyaRate > 0) { const f = rest * fyaRate; fya += f; later[POOL_OF[c]] += rest - f; rest = 0; }
    pool[POOL_OF[c]] += rest;
  }
  const aiaTotal = Object.values(aiaUsed).reduce((a, b) => a + b, 0);
  const wdaMain = poolWda(pool.main, RATES.mainWda, v.months);
  const wdaSpecial = poolWda(pool.special, RATES.specialWda, v.months);
  const total = aiaTotal + fya + wdaMain + wdaSpecial;
  return { aiaTotal, fya, wdaMain, wdaSpecial, total, carryMain: pool.main - wdaMain + later.main, carrySpecial: pool.special - wdaSpecial + later.special, aiaUsed };
}

export function compute(raw) {
  const errors = [];
  const v = { entity: raw.entity === "sole" ? "sole" : "company" };
  const num = (k, label, min = 0) => {
    const s = String(raw[k] ?? "").trim();
    const n = s === "" ? 0 : Number(s);
    if (!Number.isFinite(n) || n < min) { errors.push(`${label} must be a number of ${min} or more.`); return 0; }
    return n;
  };
  v.months = num("months", "Accounting period (months)", 1);
  if (v.months > 18) errors.push("An accounting period cannot be longer than 18 months.");
  else if (v.months > 12 && v.entity === "company") errors.push("A company's Corporation Tax accounting period is at most 12 months. A longer period of account is split into a 12-month period and the months after it: work each one out separately, with the spend that falls in it.");
  if (String(raw.taxRate ?? "").trim() === "") errors.push("Tax rate is needed to work out the tax saved.");
  v.taxRate = num("taxRate", "Tax rate");
  if (v.taxRate > 100) errors.push("Tax rate must be a percentage up to 100.");
  const profitText = String(raw.profit ?? "").trim();
  v.profit = profitText === "" ? null : Number(profitText);
  if (v.profit !== null && !Number.isFinite(v.profit)) errors.push("Profit before allowances must be a number.");
  const labels = { mainNew: "New main-rate equipment", mainUsed: "Second-hand main-rate equipment", specialNew: "New special-rate items", specialUsed: "Second-hand special-rate items", carMain: "Cars at the main rate", carSpecial: "Cars at the special rate", mainBf: "Main pool brought forward", specialBf: "Special-rate pool brought forward" };
  for (const k of FIELDS) v[k] = num(k, labels[k]);
  if (errors.length) return { errors };

  const isCompany = v.entity === "company";
  // Best order: spend the AIA where it adds most over what you would get anyway.
  const gain = (c) => 1 - baseline(c, isCompany);
  const best = AIA_CATS.filter((c) => gain(c) > 0).sort((a, b) => gain(b) - gain(a));
  const naive = [...AIA_CATS];
  const opt = claim(v, best);
  const nav = claim(v, naive);
  const none = claim(v, []);
  const rate = v.taxRate / 100;
  const spendTotal = FIELDS.slice(0, 6).reduce((s, k) => s + v[k], 0);

  // Years 2-5: no further additions, pools keep writing down.
  const years = [{ year: 1, deduction: opt.total, saving: opt.total * rate }];
  let m = opt.carryMain, s = opt.carrySpecial, cum = opt.total;
  for (let y = 2; y <= 5; y++) {
    const d = poolWda(m, RATES.mainWda, 12) + poolWda(s, RATES.specialWda, 12);
    m -= poolWda(m, RATES.mainWda, 12); s -= poolWda(s, RATES.specialWda, 12);
    cum += d;
    years.push({ year: y, deduction: d, saving: d * rate, cumulative: cum });
  }
  years[0].cumulative = opt.total;

  const findings = [];
  const aiaCap = RATES.aia * v.months / 12;
  const carSpend = v.carMain + v.carSpecial;
  if (carSpend > 0) findings.push({ severity: "medium", title: `${money0(carSpend)} on cars gets no Annual Investment Allowance: it goes into a pool at 14% or 6% a year. Check whether a zero-emission car qualifies for a first-year allowance for your period.` });
  if (!isCompany && v.mainNew + v.specialNew > 0) findings.push({ severity: "info", title: "Full expensing and the 50% special-rate allowance are for companies only. Sole traders and partnerships get the AIA, then a 40% first-year allowance on new main-rate equipment (not cars) from 1 January 2026, then 14% / 6% writing-down." });
  if (aiaCap !== RATES.aia) findings.push({ severity: "info", title: `The AIA, writing-down allowances and small pools limit are scaled to ${v.months} months: an AIA of ${money0(aiaCap)} for this period.` });
  const eligible = AIA_CATS.reduce((a, c) => a + v[c], 0);
  if (eligible > aiaCap) findings.push({ severity: "high", title: `Eligible spend of ${money0(eligible)} is above your AIA of ${money0(aiaCap)}: the excess gets only ${isCompany ? "full expensing / pool allowances" : "the 40% first-year allowance (new main-rate equipment) or 14% / 6% a year"}.` });
  const gainOrder = round2(opt.total - nav.total);
  if (gainOrder > 1) findings.push({ severity: "high", title: `Putting the AIA on the right items first adds ${money0(gainOrder)} to this year's deduction compared with using it in the order you listed the categories.` });
  if (v.mainUsed + v.specialUsed > 0) findings.push({ severity: "info", title: "Second-hand items are eligible for the AIA but not for full expensing or first-year allowances, so the AIA is best spent on them first." });
  if (v.profit !== null && opt.total > v.profit) findings.push({ severity: "high", title: `Claiming everything (${money0(opt.total)}) is more than your profit of ${money0(v.profit)}: it would create a loss. You may claim less, to keep pool balances for later years, or use the loss.` });
  if (opt.wdaMain === v.mainBf && v.mainBf > 0 && v.mainBf <= RATES.smallPool * v.months / 12) findings.push({ severity: "info", title: "Your main pool is within the small pools allowance, so it can be written off in full." });

  const obligations = [
    { title: "Claim in your return", why: isCompany ? "Allowances are claimed in the company tax return (CT600) computations. You can claim less than the maximum." : "Allowances are claimed in the self-employment or partnership pages of the Self Assessment return. You can claim less than the maximum." },
    { title: "Keep invoices and dates", why: "HMRC can ask for the invoice, the date the item was bought and what it is used for. Mixed private use means a restricted claim." },
    { title: "Disposals", why: "Selling an item later can create a balancing charge or allowance. This tool does not model it." },
    { title: "Check the rates", why: `Rates here are ${RATES.year}, checked against GOV.UK on 2026-11-23: main pool 14% from April 2026 (18% before), 40% first-year allowance from 1 January 2026. A company period that straddles 1 April 2026 needs a time-apportioned hybrid rate, which this tool does not work out. Confirm on GOV.UK before filing.` },
  ];

  return {
    errors: [], entity: v.entity, spendTotal, aiaCap, plan: best.map((c) => ({ category: c, aia: opt.aiaUsed[c] || 0 })),
    optimal: opt, naive: nav, none, years, taxSaving: round2(opt.total * rate), findings, obligations,
  };
}

export function summaryText(r) {
  const o = r.optimal;
  return [
    `UK capital allowances (${RATES.year}), ${r.entity === "company" ? "company" : "sole trader / partnership"}`,
    `Spend this period: ${money0(r.spendTotal)}`,
    `AIA claimed: ${money0(o.aiaTotal)}  First-year allowance: ${money0(o.fya)}`,
    `Writing-down: main ${money0(o.wdaMain)}, special ${money0(o.wdaSpecial)}`,
    `Total deduction this year: ${money0(o.total)}  Tax saved: ${money0(r.taxSaving)}`,
    `Carried forward: main ${money0(o.carryMain)}, special ${money0(o.carrySpecial)}`,
    "Not tax advice. Verify rates on GOV.UK.",
  ].join("\n");
}
