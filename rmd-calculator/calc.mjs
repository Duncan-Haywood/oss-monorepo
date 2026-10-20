// Required minimum distribution (RMD) planner. Pure arithmetic, no I/O.
// Rules read from IRS Publication 590-B and SECURE 2.0 (2022 Uniform Lifetime
// Table, RMD start ages 72/73/75, 25% / 10% excise tax). Not verified against
// an IRS worksheet or a custodian statement.

// IRS Uniform Lifetime Table (Pub. 590-B, Table III, effective 2022), age -> distribution period.
export const UNIFORM = {
  72: 27.4, 73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9, 78: 22.0, 79: 21.1, 80: 20.2,
  81: 19.4, 82: 18.5, 83: 17.7, 84: 16.8, 85: 16.0, 86: 15.2, 87: 14.4, 88: 13.7, 89: 12.9,
  90: 12.2, 91: 11.5, 92: 10.8, 93: 10.1, 94: 9.5, 95: 8.9, 96: 8.4, 97: 7.8, 98: 7.3,
  99: 6.8, 100: 6.4, 101: 6.0, 102: 5.6, 103: 5.2, 104: 4.9, 105: 4.6, 106: 4.3, 107: 4.1,
  108: 3.9, 109: 3.7, 110: 3.5, 111: 3.4, 112: 3.3, 113: 3.1, 114: 3.0, 115: 2.9, 116: 2.8,
  117: 2.7, 118: 2.5, 119: 2.3,
};

export function rmdStartAge(birthYear) {
  if (birthYear <= 1950) return 72; // 72 for 1949-1950; earlier births are already taking RMDs
  if (birthYear <= 1959) return 73;
  return 75;
}

export function distributionPeriod(age) {
  if (!Number.isFinite(age) || age < 72) return null;
  if (age >= 120) return 2.0;
  return UNIFORM[Math.floor(age)];
}

export function rmdFor(balance, age) {
  const p = distributionPeriod(age);
  if (p === null || !(balance > 0)) return 0;
  return balance / p;
}

export function money(n) {
  return Math.round(n).toLocaleString("en-US");
}

export function ageLabel(n) {
  return String(n);
}

const num = (v) => {
  if (typeof v === "number") return v;
  const s = String(v ?? "").replace(/[$,\s]/g, "");
  if (s === "") return NaN;
  return Number(s);
};

// Excise tax on a missed RMD: 25%, or 10% if corrected inside the correction window.
export function penalty(required, withdrawn, corrected) {
  const shortfall = Math.max(0, required - withdrawn);
  const rate = corrected ? 0.1 : 0.25;
  return { shortfall, rate, tax: shortfall * rate };
}

export function project({ birthYear, ira, plan, growth, qcd, qcdLimit, rateNow, rateStacked, delayFirst, throughAge }) {
  const start = rmdStartAge(birthYear);
  let ib = ira, pb = plan;
  const rows = [];
  let carry = 0; // first RMD taken in the following year when delayed
  for (let age = start; age <= throughAge; age++) {
    const year = birthYear + age;
    const rI = rmdFor(ib, age), rP = rmdFor(pb, age);
    let rmd = rI + rP;
    let extra = 0;
    let firstDelayed = false;
    if (delayFirst && age === start) { carry = rmd; firstDelayed = true; rmd = 0; }
    else if (delayFirst && age === start + 1) { extra = carry; }
    const q = Math.min(Math.max(0, qcd), qcdLimit, ib);
    const totalRequired = rmd + extra;
    const qcdUsed = Math.min(q, ib);
    const taxable = Math.max(0, totalRequired - qcdUsed);
    const stacked = age === start + 1 && delayFirst;
    const rate = stacked ? rateStacked : rateNow;
    const tax = taxable * rate;
    const withdrawn = Math.max(totalRequired, qcdUsed);
    // Withdrawals are modelled at the start of the year; growth applies to what remains.
    const share = (ib + pb) > 0 ? ib / (ib + pb) : 0;
    const taken = Math.min(withdrawn, ib + pb);
    const iraOut = Math.min(ib, Math.max(qcdUsed, taken * share));
    const planOut = Math.min(pb, taken - iraOut);
    ib = Math.max(0, ib - iraOut) * (1 + growth);
    pb = Math.max(0, pb - planOut) * (1 + growth);
    rows.push({ age, year, factor: distributionPeriod(age), rmd: totalRequired, delayed: firstDelayed, qcd: qcdUsed, taxable, rate, tax, end: ib + pb });
  }
  return rows;
}

export function analyze(raw) {
  const birthYear = Math.round(num(raw.birthYear));
  const ira = num(raw.ira) || 0;
  const plan = num(raw.plan) || 0;
  const growth = (num(raw.growth) || 0) / 100;
  const qcd = num(raw.qcd) || 0;
  const qcdLimit = num(raw.qcdLimit) || 0;
  const rateNow = (num(raw.rateNow) || 0) / 100;
  const rateStacked = (num(raw.rateStacked) || 0) / 100;
  const throughAge = Math.round(num(raw.throughAge) || 95);
  const delayFirst = Boolean(raw.delayFirst);
  const withdrawn = raw.withdrawn === "" || raw.withdrawn == null ? null : num(raw.withdrawn);
  if (!Number.isFinite(birthYear) || birthYear < 1930 || birthYear > 2010) return { error: "Enter a birth year between 1930 and 2010." };
  if (!(ira + plan > 0) || ira < 0 || plan < 0) return { error: "Enter the December 31 balance of at least one traditional IRA or employer plan." };
  if (growth < -0.5 || growth > 0.3) return { error: "Growth rate should be between -50 and 30 percent a year." };
  if (rateNow < 0 || rateNow > 0.5 || rateStacked < 0 || rateStacked > 0.5) return { error: "Tax rates should be between 0 and 50 percent." };
  const start = rmdStartAge(birthYear);
  if (throughAge < start || throughAge > 110) return { error: `Project through an age from ${start} to 110.` };
  const rows = project({ birthYear, ira, plan, growth, qcd, qcdLimit, rateNow, rateStacked, delayFirst, throughAge });
  const first = rows[0];
  const totalRmd = rows.reduce((s, r) => s + r.rmd, 0);
  const totalTax = rows.reduce((s, r) => s + r.tax, 0);
  const baseline = project({ birthYear, ira, plan, growth, qcd: 0, qcdLimit, rateNow, rateStacked, delayFirst, throughAge });
  const qcdTaxSaved = baseline.reduce((s, r) => s + r.tax, 0) - totalTax;
  const now = first.year;
  const findings = [];
  const noDelay = project({ birthYear, ira, plan, growth, qcd, qcdLimit, rateNow, rateStacked, delayFirst: false, throughAge });
  const firstOnTime = noDelay[0].rmd;
  const secondOnTime = noDelay[1] ? noDelay[1].rmd : 0;
  const delayCost = firstOnTime * Math.max(0, rateStacked - rateNow);
  findings.push({
    severity: "info",
    title: `First RMD: ${"$" + money(firstOnTime)} for ${now} at age ${start}`,
    detail: `Balance of $${money(ira + plan)} on December 31 of the year before, divided by the IRS distribution period ${first.factor}. Due by December 31, ${now}. ${start === 72 ? "" : `Your RMD start age is ${start} because you were born in ${birthYear}.`}`,
  });
  if (firstOnTime > 0 && noDelay[1]) {
    findings.push({
      severity: delayFirst ? "medium" : "info",
      title: delayFirst ? "You chose to delay the first RMD to April 1: two RMDs land in one year" : "Delaying the first RMD to April 1 would put two RMDs in one year",
      detail: `Waiting until April 1, ${now + 1} moves $${money(firstOnTime)} into ${now + 1}, on top of that year's own $${money(secondOnTime)}. At ${(rateStacked * 100).toFixed(0)}% instead of ${(rateNow * 100).toFixed(0)}% the extra federal tax is about $${money(delayCost)} (an approximation: your real bracket effect depends on all your other income; state tax and IRMAA surcharges are not counted).`,
    });
  }
  if (qcd > 0) {
    findings.push({
      severity: "info",
      title: `Qualified charitable distributions cut the taxable RMD by about $${money(qcdTaxSaved)} over the projection`,
      detail: `A QCD goes straight from an IRA to a charity, counts toward the RMD and is left out of taxable income. Each year is capped at the limit you entered ($${money(qcdLimit)}) and at the IRA balance. QCDs are not allowed from 401(k)/403(b) plans and must be to an eligible charity, not a donor-advised fund.`,
    });
  }
  let pen = null;
  if (withdrawn !== null) {
    if (!Number.isFinite(withdrawn) || withdrawn < 0) return { error: "Amount already taken must be a number or empty." };
    const late = penalty(first.rmd || firstOnTime, withdrawn, false);
    const fixed = penalty(first.rmd || firstOnTime, withdrawn, true);
    pen = { required: first.rmd || firstOnTime, withdrawn, late, fixed };
    findings.push({
      severity: late.shortfall > 0 ? "medium" : "info",
      title: late.shortfall > 0 ? `Shortfall $${money(late.shortfall)}: excise tax $${money(late.tax)} at 25%, or $${money(fixed.tax)} at 10% if fixed in time` : "No shortfall: the RMD amount is covered",
      detail: late.shortfall > 0 ? "The excise tax is in addition to income tax on the shortfall once you withdraw it. It drops from 25% to 10% if you take the missed amount and file Form 5329 within the correction window, and the IRS can waive it entirely for reasonable cause. Take the missed distribution as soon as you notice." : "Compare against your custodian's own RMD statement, which is the number to follow.",
    });
  }
  return { birthYear, start, rows, first, totalRmd, totalTax, qcdTaxSaved, delayCost, firstOnTime, secondOnTime, pen, findings, ira, plan, growth, throughAge, delayFirst };
}

export function sampleInput() {
  return { birthYear: "1953", ira: "620000", plan: "180000", growth: "5", qcd: "10000", qcdLimit: "111000", rateNow: "22", rateStacked: "24", throughAge: "95", delayFirst: false, withdrawn: "" };
}

const csvCell = (v) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function reportCsv(a) {
  const lines = [["Year", "Age", "Distribution period", "RMD", "QCD", "Taxable RMD", "Estimated federal tax", "Year-end balance"].join(",")];
  for (const r of a.rows) lines.push([r.year, r.age, r.factor, r.rmd.toFixed(2), r.qcd.toFixed(2), r.taxable.toFixed(2), r.tax.toFixed(2), r.end.toFixed(2)].map(csvCell).join(","));
  return lines.join("\n") + "\n";
}
