// Coast FIRE arithmetic. Everything is in today's money: returns are REAL (after
// inflation), spending and income are in today's dollars. Compounding is monthly
// at the rate that equals the stated annual real return over a year.

const num = (v, fallback = NaN) => {
  if (v === "" || v === null || v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export function monthlyRate(annual) {
  return Math.pow(1 + annual, 1 / 12) - 1;
}

// Future value of `p0` plus level monthly flows `m` (positive = contribution)
// over `months` months at annual real return `annual`, flows at month end.
export function futureValue(p0, m, months, annual) {
  const rm = monthlyRate(annual);
  const g = Math.pow(1 + rm, months);
  const a = rm === 0 ? months : (g - 1) / rm;
  return p0 * g + m * a;
}

// The portfolio that supports `spending` a year after `otherIncome` at `swr`.
export function fireNumber(spending, swr, otherIncome = 0) {
  return Math.max(0, spending - otherIncome) / swr;
}

// What you need today so that, with no further contributions, growth alone
// reaches the FIRE number by retirement.
export function coastNumber(fire, annual, years) {
  return fire / Math.pow(1 + annual, years);
}

export function validate(input) {
  const v = {
    age: num(input.age), retireAge: num(input.retireAge), portfolio: num(input.portfolio),
    spending: num(input.spending), swr: num(input.swr) / 100, ret: num(input.ret) / 100,
    otherIncome: num(input.otherIncome, 0), monthlySave: num(input.monthlySave, 0),
    partTimeIncome: num(input.partTimeIncome, 0),
  };
  if (!(v.age >= 16 && v.age < 100)) return { error: "Enter your current age (16–99)." };
  if (!(v.retireAge > v.age && v.retireAge <= 100)) return { error: "Retirement age must be later than your current age." };
  if (!(v.portfolio >= 0)) return { error: "Enter your invested savings today (0 or more)." };
  if (!(v.spending > 0)) return { error: "Enter your yearly spending in retirement, in today's dollars." };
  if (!(v.swr > 0 && v.swr <= 0.1)) return { error: "Withdrawal rate must be between 0.1% and 10%." };
  if (!(v.ret > -0.05 && v.ret <= 0.15)) return { error: "Real return must be between -5% and 15% a year." };
  if (!(v.otherIncome >= 0)) return { error: "Retirement income (Social Security, pension) cannot be negative." };
  if (!(v.monthlySave >= 0)) return { error: "Monthly savings cannot be negative." };
  if (!(v.partTimeIncome >= 0)) return { error: "Part-time income cannot be negative." };
  return { v };
}

// First month at which the portfolio (with contributions) is at or above the
// coast threshold for that moment. Returns null if never before retirement.
export function monthsToCoast(v) {
  const n = Math.round((v.retireAge - v.age) * 12);
  const fire = fireNumber(v.spending, v.swr, v.otherIncome);
  const rm = monthlyRate(v.ret);
  let p = v.portfolio;
  for (let m = 0; m <= n; m++) {
    const threshold = fire / Math.pow(1 + v.ret, (n - m) / 12);
    if (p >= threshold) return m;
    p = p * (1 + rm) + v.monthlySave;
  }
  return null;
}

export function ageLadder(v, fire) {
  const rows = [];
  const start = Math.ceil(v.age);
  for (let a = start; a <= v.retireAge; a += a + 5 > v.retireAge && a < v.retireAge ? v.retireAge - a : 5) {
    rows.push({ age: a, coast: coastNumber(fire, v.ret, v.retireAge - a) });
    if (a >= v.retireAge) break;
  }
  return rows;
}

export function plan(input) {
  const checked = validate(input);
  if (checked.error) return { error: checked.error };
  const v = checked.v;
  const years = v.retireAge - v.age;
  const n = Math.round(years * 12);
  const fire = fireNumber(v.spending, v.swr, v.otherIncome);
  const coast = coastNumber(fire, v.ret, years);
  const growthOnly = futureValue(v.portfolio, 0, n, v.ret);
  const growthWithSaving = futureValue(v.portfolio, v.monthlySave, n, v.ret);
  const rm = monthlyRate(v.ret);
  const g = Math.pow(1 + rm, n);
  const a = rm === 0 ? n : (g - 1) / rm;
  // Positive: monthly saving still needed to reach FIRE at retirement.
  // Negative: monthly amount you could draw and still arrive at FIRE.
  const gapMonthly = (fire - v.portfolio * g) / a;
  const coasting = v.portfolio >= coast;
  const m2c = monthsToCoast(v);
  const barista = coasting ? {
    sustainableDrawYear: -gapMonthly * 12,
    incomeNeededYear: Math.max(0, v.spending + gapMonthly * 12),
  } : null;
  const sens = [-0.02, 0, 0.02].map((d) => {
    const r = Math.max(-0.04, v.ret + d);
    const c = coastNumber(fire, r, years);
    return { ret: r, coast: c, reached: v.portfolio >= c, atRetirement: futureValue(v.portfolio, 0, n, r) };
  });
  const out = {
    input: v, years, fire, coast, growthOnly, growthWithSaving,
    fundedPct: coast > 0 ? Math.min(999, (v.portfolio / coast) * 100) : 100,
    coasting, monthsToCoast: m2c,
    coastAge: m2c === null ? null : v.age + m2c / 12,
    neededMonthlyToFire: Math.max(0, gapMonthly),
    barista, sens, ladder: ageLadder(v, fire),
    hitsFireWithSaving: growthWithSaving >= fire - 0.5,
  };
  out.advice = advise(out);
  return out;
}

const usd = (x) => "$" + Math.round(x).toLocaleString("en-US");

function advise(r) {
  const v = r.input;
  const out = [];
  out.push(`To support ${usd(v.spending)} a year${v.otherIncome ? ` after ${usd(v.otherIncome)} of other retirement income` : ""} at a ${(v.swr * 100).toFixed(1)}% withdrawal rate you need ${usd(r.fire)} at age ${v.retireAge}.`);
  if (r.coasting) {
    out.push(`You are already past your Coast FIRE number of ${usd(r.coast)}. With no more contributions, ${usd(v.portfolio)} grows to about ${usd(r.growthOnly)} (today's money) by ${v.retireAge}, which is ${usd(r.fire)} or more.`);
    if (r.barista.incomeNeededYear <= 0) {
      out.push(`Your savings are far enough ahead that you could draw about ${usd(r.barista.sustainableDrawYear)} a year from now and still arrive at your number, which covers your whole ${usd(v.spending)} budget.`);
    } else {
      out.push(`Barista version: you could draw about ${usd(r.barista.sustainableDrawYear)} a year now and still arrive at ${usd(r.fire)} by ${v.retireAge}, so work that earns about ${usd(r.barista.incomeNeededYear)} a year after tax covers the rest of your ${usd(v.spending)} budget.`);
    }
  } else {
    out.push(`Your Coast FIRE number today is ${usd(r.coast)}; you have ${usd(v.portfolio)} (${r.fundedPct.toFixed(0)}%). Left alone it grows to about ${usd(r.growthOnly)} by ${v.retireAge}, short of ${usd(r.fire)}.`);
    if (v.monthlySave > 0) {
      if (r.monthsToCoast === null) out.push(`Saving ${usd(v.monthlySave)} a month does not reach the coast line before ${v.retireAge}; you would need about ${usd(r.neededMonthlyToFire)} a month to reach ${usd(r.fire)} at ${v.retireAge}.`);
      else out.push(`Saving ${usd(v.monthlySave)} a month, you cross the coast line at about age ${r.coastAge.toFixed(1)}. After that you only need to cover your living costs.`);
    } else {
      out.push(`To reach ${usd(r.fire)} at ${v.retireAge} by saving alone you would need about ${usd(r.neededMonthlyToFire)} a month. Enter a monthly saving amount to see when you would cross the coast line.`);
    }
  }
  if (v.partTimeIncome > 0 && r.coasting) {
    const gap = Math.max(0, v.spending - v.partTimeIncome);
    out.push(`With ${usd(v.partTimeIncome)} a year of part-time pay you would still need to draw ${usd(gap)} a year from savings while coasting; ${gap <= r.barista.sustainableDrawYear ? "that is within what keeps you on track." : "that is more than keeps you on track, so the savings would not reach your number."}`);
  }
  const worst = r.sens[0];
  out.push(`If real returns are ${(worst.ret * 100).toFixed(1)}% instead of ${(v.ret * 100).toFixed(1)}%, the coast number rises to ${usd(worst.coast)}${r.coasting && !worst.reached ? ", which you would no longer meet" : ""}.`);
  return out;
}

export function sampleInput() {
  return { age: 32, retireAge: 60, portfolio: 120000, spending: 48000, swr: 4, ret: 5, otherIncome: 18000, monthlySave: 600, partTimeIncome: 24000 };
}

export function toCsv(r) {
  const rows = [["age", "coast_number_usd"]];
  for (const l of r.ladder) rows.push([l.age, Math.round(l.coast)]);
  return rows.map((x) => x.join(",")).join("\n") + "\n";
}

export { usd };
