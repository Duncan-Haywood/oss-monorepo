// 529-to-Roth IRA rollover planner (SECURE 2.0, IRC 529(c)(3)(E)). Pure functions, nothing leaves the browser.
//
// Rules modelled (verify against IRS guidance; they are inputs where they change yearly):
//   - The 529 account must have been open for the same beneficiary at least 15 years.
//   - Contributions made in the last 5 years, and the earnings on them, cannot be rolled over.
//   - Lifetime cap per beneficiary: $35,000.
//   - Each year's rollover is limited to the Roth IRA contribution limit minus any other IRA contributions
//     that year, and to the beneficiary's earned income for the year. It is a direct 529-to-Roth transfer.
//   - Roth income phase-outs do not apply to the rollover.
// Model: no new 529 contributions; the whole account grows at one typed rate; recent-contribution buckets
// become eligible once they are five full years old (the conservative reading while rules are interpreted).

export const DEFAULTS = {
  balance: 60000,
  basis: 38000,
  accountAgeYears: 12,
  contrib0: 0,
  contrib1: 0,
  contrib2: 2000,
  contrib3: 2000,
  contrib4: 2000,
  growthPct: 5,
  annualLimit: 7500,
  limitGrowthPct: 2,
  otherIraContrib: 0,
  earnedIncome: 30000,
  lifetimeCap: 35000,
  beneficiaryAge: 22,
  retireAge: 65,
  rothGrowthPct: 7,
  withdrawalTaxPct: 22,
};

export const HORIZON = 20;

export const num = (s) => {
  if (typeof s === "number") return s;
  const t = String(s ?? "").replace(/[$,%\s]/g, "");
  return t === "" ? NaN : Number(t);
};
export const money = (x) => `${x < 0 ? "-" : ""}$${Math.abs(Math.round(x)).toLocaleString("en-US")}`;
export const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;

export function validate(o) {
  const w = [];
  const nonNeg = ["balance", "basis", "contrib0", "contrib1", "contrib2", "contrib3", "contrib4", "annualLimit", "otherIraContrib", "earnedIncome", "lifetimeCap"];
  for (const k of nonNeg) if (!(o[k] >= 0)) w.push(`${k} must be zero or more.`);
  if (!(o.accountAgeYears >= 0)) w.push("Account age must be zero or more years.");
  if (!(o.growthPct > -50 && o.growthPct < 50)) w.push("Growth rate looks out of range.");
  if (!(o.retireAge > o.beneficiaryAge)) w.push("Retirement age must be above the beneficiary's age.");
  const recent = [0, 1, 2, 3, 4].reduce((s, i) => s + (o[`contrib${i}`] || 0), 0);
  if (recent > o.balance) w.push("Contributions in the last five years exceed the balance.");
  return w;
}

export function analyze(input) {
  const o = { ...DEFAULTS, ...input };
  const warnings = validate(o);
  if (warnings.length) return { opts: o, warnings, result: null };
  const g = o.growthPct / 100;
  let buckets = [0, 1, 2, 3, 4].map((a) => ({ age: a, amt: o[`contrib${a}`] }));
  const recent0 = buckets.reduce((s, b) => s + b.amt, 0);
  let eligible = o.balance - recent0;
  let capLeft = o.lifetimeCap;
  const schedule = [];
  let total = 0;
  let fv = 0;
  const yearsToRetire = o.retireAge - o.beneficiaryAge;
  for (let t = 0; t < HORIZON; t++) {
    // buckets that reach age 5 become eligible
    const aged = buckets.filter((b) => b.age >= 5);
    for (const b of aged) eligible += b.amt;
    buckets = buckets.filter((b) => b.age < 5);
    const open = o.accountAgeYears + t >= 15;
    const limit = o.annualLimit * Math.pow(1 + o.limitGrowthPct / 100, t);
    const room = Math.max(0, limit - o.otherIraContrib);
    let roll = 0;
    let binding = "";
    if (open && capLeft > 0 && eligible > 0) {
      const caps = [["IRA limit", room], ["earned income", o.earnedIncome], ["lifetime cap", capLeft], ["eligible balance", eligible]];
      caps.sort((a, b) => a[1] - b[1]);
      roll = caps[0][1];
      binding = caps[0][0];
    }
    eligible -= roll;
    capLeft -= roll;
    total += roll;
    if (roll > 0) fv += roll * Math.pow(1 + o.rothGrowthPct / 100, Math.max(0, yearsToRetire - t));
    schedule.push({ year: t, open, roll, binding, eligibleAfter: eligible, ineligible: buckets.reduce((s, b) => s + b.amt, 0) });
    eligible *= 1 + g;
    buckets = buckets.map((b) => ({ age: b.age + 1, amt: b.amt * (1 + g) }));
  }
  const firstYear = schedule.find((s) => s.roll > 0);
  const lastYear = [...schedule].reverse().find((s) => s.roll > 0);
  const earningsShare = o.balance > 0 ? Math.max(0, (o.balance - o.basis) / o.balance) : 0;
  const altTax = total * earningsShare * (o.withdrawalTaxPct / 100 + 0.1);
  const yearsOpenGap = Math.max(0, 15 - o.accountAgeYears);
  const notes = [];
  if (yearsOpenGap > 0) notes.push(`The account is ${o.accountAgeYears} years old: rollovers cannot start for ${yearsOpenGap} more year(s).`);
  if (recent0 > 0) notes.push(`${money(recent0)} of recent contributions (plus their growth) stays locked until each contribution is five years old.`);
  if (o.earnedIncome < o.annualLimit) notes.push("Earned income is below the annual limit, so income is what caps each rollover.");
  if (!firstYear) notes.push(`No rollover happens inside ${HORIZON} years with these inputs.`);
  return {
    opts: o,
    warnings,
    notes,
    result: {
      total,
      firstYearOffset: firstYear ? firstYear.year : null,
      yearsToFinish: lastYear ? lastYear.year + 1 : null,
      remainingInAccount: eligible + buckets.reduce((s, b) => s + b.amt, 0),
      lockedNow: recent0,
      capUsedPct: o.lifetimeCap > 0 ? total / o.lifetimeCap : 0,
      rothValueAtRetirement: fv,
      altTaxAndPenalty: altTax,
      earningsShare,
    },
    schedule,
  };
}

export function toCsv(a) {
  const rows = ["year_from_now,rollover_usd,limiting_factor,eligible_balance_after_usd"];
  for (const s of a.schedule) if (s.roll > 0) rows.push(`${s.year},${s.roll.toFixed(2)},${s.binding},${s.eligibleAfter.toFixed(2)}`);
  return rows.join("\n") + "\n";
}
