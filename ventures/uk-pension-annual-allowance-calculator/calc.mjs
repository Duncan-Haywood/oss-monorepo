// UK pension annual allowance calculator: the tapered annual allowance for high earners, unused allowance carried forward from the
// previous three tax years, how much you can still pay in, and the income tax charge on any excess.
// Pure functions, no I/O. Bad input is rejected with a message, never clamped.
// Written from memory WITHOUT network access in the building session. Rules modelled (England, Wales and Northern Ireland rates):
// standard annual allowance 60,000 (40,000 for 2022/23 and earlier back to 2014/15); tapered when threshold income is over 200,000 AND
// adjusted income is over 260,000, by 1 for every 2 of adjusted income over 260,000 (whole pounds), never below 10,000; money purchase
// annual allowance 10,000 once defined contribution pension has been flexibly accessed, with no carry forward; unused allowance of the
// previous three tax years can be used after the current year's allowance, oldest year first, only for years you were a member of a
// registered scheme; the excess is taxed as non-savings income on top of the rest of your income at 20/40/45%.
// Adjusted income = income before pension + employer contributions + salary sacrificed + the employer-funded part of any defined benefit
// input. Threshold income = income before pension minus your own contributions (salary sacrifice arrangements are added back).
// NOT modelled: Scottish rates, lump-sum and death-benefit inputs, the alternative annual allowance, scheme pays elections,
// the lifetime allowance's replacements, the relief limit of 100% of UK relevant earnings, and mixed money purchase/defined benefit
// inputs under the money purchase allowance. Every result names its source to verify.

export const VERIFY = "GOV.UK 'Tax on your private pension contributions: annual allowance' and 'Pension schemes: work out your tapered annual allowance'; HMRC Pensions Tax Manual PTM055000";
export const YEARS = { 2025: "2025/26", 2026: "2026/27" };
export const AA = 60000, AA_MIN = 10000, THRESHOLD_INCOME = 200000, TAPER_START = 260000, MPAA = 10000;
export const PA = 12570, BASIC_BAND = 37700, PA_GONE = 125140, TAPER_PA_START = 100000;
// Annual allowance in each of the three tax years before the year tested, oldest first (before any personal tapering).
export const PRIOR = {
  2025: [{ label: "2022/23", aa: 40000 }, { label: "2023/24", aa: 60000 }, { label: "2024/25", aa: 60000 }],
  2026: [{ label: "2023/24", aa: 60000 }, { label: "2024/25", aa: 60000 }, { label: "2025/26", aa: 60000 }],
};

const money = (n) => "GBP " + Number(Math.round(n * 100) / 100).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const r2 = (n) => Math.round(n * 100) / 100;
const pct = (x) => Math.round(x * 1000) / 10 + "%";

// Tapered annual allowance. `thresholdIncome` gates the taper; `adjustedIncome` sizes it.
export function annualAllowance(thresholdIncome, adjustedIncome) {
  if (thresholdIncome <= THRESHOLD_INCOME || adjustedIncome <= TAPER_START) return AA;
  const cut = Math.floor((adjustedIncome - TAPER_START) / 2);
  return Math.max(AA_MIN, AA - cut);
}

// Defined benefit input amount: 16 x the rise in accrued annual pension above revaluation of the opening figure.
export function dbInputAmount(opening, closing, revaluationPct) {
  return Math.max(0, r2(16 * (closing - opening * (1 + revaluationPct / 100))));
}

function bandTax(t) {
  const basic = Math.min(t, BASIC_BAND);
  const higher = Math.max(0, Math.min(t, PA_GONE) - BASIC_BAND);
  const additional = Math.max(0, t - PA_GONE);
  return basic * 0.2 + higher * 0.4 + additional * 0.45;
}

// Income tax charge on `excess` treated as the top slice of income on top of `base` (England, Wales, Northern Ireland).
export function excessCharge(base, excess) {
  if (!(excess > 0)) return 0;
  const pa = base <= TAPER_PA_START ? PA : Math.max(0, PA - (base - TAPER_PA_START) / 2);
  const t0 = Math.max(0, base - pa);
  return bandTax(t0 + excess) - bandTax(t0);
}

export function parse(input) {
  const i = input || {};
  const errors = [];
  const num = (key, label, optional) => {
    const v = i[key];
    if (v === undefined || v === null || v === "") { if (!optional) errors.push(`Enter ${label}.`); return null; }
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) { errors.push(`Enter ${label} as zero or more.`); return null; }
    return n;
  };
  const year = Number(i.year);
  if (!YEARS[year]) errors.push("Pick the tax year.");
  const mpaa = i.mpaa === "yes" || i.mpaa === true;
  const income = num("income", "your income before any pension deduction (pay plus other taxable income)");
  const own = num("own", "your own defined contribution payments, gross (zero if none)", true) ?? 0;
  const sacrificed = num("sacrificed", "the salary you sacrificed into the pension (zero if none)", true) ?? 0;
  const employer = num("employer", "your employer's contributions (zero if none)", true) ?? 0;
  const dbInput = num("dbInput", "your defined benefit pension input amount (zero if none)", true) ?? 0;
  const dbOwn = num("dbOwn", "your own contributions to the defined benefit scheme (zero if none)", true) ?? 0;
  if (dbOwn > dbInput) errors.push("Your own defined benefit contributions cannot exceed the defined benefit input amount.");
  if (income !== null && income > 5000000) errors.push("Income above 5,000,000 looks like a typo.");
  if (income !== null && own + sacrificed + dbOwn > income) errors.push("Your own pension payments cannot exceed your income.");
  // Prior three years: blank means "not a member of a registered scheme that year" (no carry forward), zero means member with nothing paid in.
  const prior = (PRIOR[year] || PRIOR[2025]).map((y, n) => {
    const used = num("used" + (n + 1), `the pension input for ${y.label} (leave blank if you were not in a pension scheme)`, true);
    const aaRaw = num("aa" + (n + 1), `your annual allowance for ${y.label}`, true);
    return { label: y.label, used, aa: aaRaw ?? y.aa, standard: y.aa };
  });
  if (mpaa && dbInput > 0) errors.push("This tool does not model a money purchase allowance together with defined benefit input. Ask your scheme or an adviser.");
  return { errors, year, mpaa, income: income ?? 0, own, sacrificed, employer, dbInput, dbOwn, prior };
}

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const label = YEARS[p.year];
  const findings = [];
  const input_ = p.own + p.sacrificed + p.employer + p.dbInput;
  const employerFunded = p.employer + p.sacrificed + Math.max(0, p.dbInput - p.dbOwn);
  const threshold = p.income - p.own - p.dbOwn;
  const adjusted = p.income + employerFunded;
  const aaStandard = p.mpaa ? MPAA : AA;
  const aa = p.mpaa ? MPAA : annualAllowance(threshold, adjusted);
  const tapered = !p.mpaa && aa < AA;
  const used = input_;
  // Carry forward: current year first, then oldest unused year first. Not available against the money purchase allowance.
  const years = p.prior.map((y) => ({ ...y, unused: !p.mpaa && y.used !== null ? Math.max(0, y.aa - y.used) : 0 }));
  const carryAvailable = years.reduce((s, y) => s + y.unused, 0);
  const excess = Math.max(0, used - aa);
  let left = excess;
  const applied = years.map((y) => { const take = Math.min(left, y.unused); left -= take; return { label: y.label, unused: y.unused, used: take, member: y.used !== null }; });
  const chargeable = r2(left);
  const base = Math.max(0, p.income - p.own - p.dbOwn - p.sacrificed);
  const charge = r2(excessCharge(base, chargeable));
  const headroom = r2(Math.max(0, aa + carryAvailable - used));

  // How much more employer/sacrificed money fits before a charge: it raises adjusted income, so it can shrink the allowance.
  let moreEmployer = headroom;
  if (!p.mpaa && threshold > THRESHOLD_INCOME) {
    const fits = (e) => used + e <= annualAllowance(threshold, adjusted + e) + carryAvailable + 1e-9;
    if (!fits(0)) moreEmployer = 0;
    else {
      let lo = 0, hi = 2000000;
      for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; }
      moreEmployer = r2(Math.floor(lo));
    }
  }

  if (p.mpaa) findings.push({ severity: "high", title: `You have flexibly accessed defined contribution pension, so the money purchase annual allowance of ${money(MPAA)} applies to your defined contribution payments and carry forward is not available. You paid in ${money(used)}.` });
  else if (tapered) findings.push({ severity: "high", title: `Your ${label} annual allowance is tapered to ${money(aa)} (standard ${money(AA)}): threshold income ${money(threshold)} is over ${money(THRESHOLD_INCOME)} and adjusted income ${money(adjusted)} is over ${money(TAPER_START)}, so you lose 1 of allowance for every 2 above ${money(TAPER_START)}.` });
  else if (threshold > THRESHOLD_INCOME) findings.push({ severity: "info", title: `Threshold income ${money(threshold)} is over ${money(THRESHOLD_INCOME)}, but adjusted income ${money(adjusted)} is not over ${money(TAPER_START)}, so no taper applies. Your allowance is ${money(AA)}.` });
  else findings.push({ severity: "info", title: `Threshold income ${money(threshold)} is not over ${money(THRESHOLD_INCOME)}, so no taper applies whatever your adjusted income. Your allowance is ${money(AA)}.` });

  if (excess === 0) findings.push({ severity: "info", title: `Your pension input of ${money(used)} is within your ${money(aa)} allowance. You can still add ${money(headroom)} this year without a charge${carryAvailable > 0 ? ` (including ${money(carryAvailable)} of carry forward)` : ""}${!p.mpaa && threshold > THRESHOLD_INCOME && moreEmployer !== headroom ? `; if it comes from your employer or salary sacrifice it also raises adjusted income, so the safe amount is ${money(moreEmployer)}` : ""}.` });
  else if (chargeable === 0) findings.push({ severity: "medium", title: `Your pension input of ${money(used)} exceeds the ${money(aa)} allowance by ${money(excess)}, but carry forward from earlier years covers all of it. No charge. Carry forward used: ${applied.filter((a) => a.used > 0).map((a) => `${money(a.used)} from ${a.label}`).join(", ")}.` });
  else findings.push({ severity: "high", title: `Your pension input of ${money(used)} exceeds your allowance${carryAvailable > 0 ? " and carry forward" : ""} by ${money(chargeable)}. That excess is taxed as income on top of your other income: an annual allowance charge of about ${money(charge)} (${pct(charge / chargeable)} of the excess).${charge > 2000 ? " Over 2,000, you may be able to ask your scheme to pay it from your benefits (Scheme Pays)." : ""}` });

  if (!p.mpaa && p.prior.some((y) => y.used === null)) findings.push({ severity: "info", title: `You left ${p.prior.filter((y) => y.used === null).map((y) => y.label).join(" and ")} blank, so no carry forward is counted from ${p.prior.filter((y) => y.used === null).length === 1 ? "that year" : "those years"}. You must have been a member of a UK registered pension scheme in a year to carry its unused allowance forward, even if nothing was paid in.` });
  if (tapered && employerFunded > 0 && excess === 0 && moreEmployer < headroom) findings.push({ severity: "medium", title: `Because employer money counts towards adjusted income, adding it shrinks your allowance in this band: each extra 2 of employer or sacrificed pay cuts 1 of allowance until the floor of ${money(AA_MIN)}.` });

  const obligations = [
    { ref: "Verify", title: "Check the rates", why: `Allowances, thresholds and bands are set by government. Confirm the current figures at ${VERIFY.split(";")[0]}.` },
    { ref: "Statement", title: "Pension Savings Statement", why: "Your scheme must send one by 6 October after the tax year if your input went over the standard allowance. Defined benefit input amounts should come from it, not from this tool." },
    { ref: "Report", title: "Report a charge on Self Assessment", why: "An annual allowance charge goes on your tax return (pension savings tax charges pages). If you have none, ask HMRC for one." },
    { ref: "Adjusted", title: "Adjusted and threshold income, not salary", why: "Both tests use your taxable income from all sources, including dividends, interest and rental profit, so enter the whole figure rather than salary alone." },
  ];
  return { errors: [], label, p, threshold, adjusted, aa, aaStandard, tapered, used, employerFunded, carryAvailable, applied, excess, chargeable, charge, headroom, moreEmployer, findings, obligations };
}

export const SAMPLE = { year: 2025, income: 285000, own: 0, sacrificed: 0, employer: 0, dbInput: 80000, dbOwn: 10000, mpaa: "no", used1: 30000, used2: 45000, used3: 50000, aa1: "", aa2: "", aa3: "" };

// Tapered allowance by adjusted income (threshold income over 200,000), for the table on the page.
export function taperTable() {
  return [260000, 280000, 300000, 320000, 340000, 360000].map((adj) => ({ adjusted: adj, aa: annualAllowance(250000, adj) }));
}

export function summaryText(r) {
  const L = [`UK pension annual allowance check, tax year ${r.label}`, "", `Threshold income: ${money(r.threshold)}`, `Adjusted income: ${money(r.adjusted)}`, `Annual allowance: ${money(r.aa)}${r.tapered ? " (tapered)" : ""}`, `Pension input this year: ${money(r.used)}`, `Carry forward available: ${money(r.carryAvailable)}`, `Excess after carry forward: ${money(r.chargeable)}`, `Estimated annual allowance charge: ${money(r.charge)}`, `Room left before a charge: ${money(r.headroom)}`];
  L.push("", ...r.findings.map((f) => `- ${f.title}`), "", ...r.obligations.map((o) => `- ${o.title}: ${o.why}`), "", `Verify against: ${VERIFY}`, "Not tax advice. No warranty.");
  return L.join("\n");
}
