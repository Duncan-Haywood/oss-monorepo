// FERS retirement planner: for a federal employee under the Federal Employees Retirement System (the basic annuity,
// the Special Retirement Supplement, and a TSP balance), what each retirement age pays and which ages are worth waiting for.
// Rules modelled (OPM, 5 U.S.C. ch. 84): annuity = multiplier x high-3 x service; multiplier 1.0%, or 1.1% when retiring at
// 62+ with 20+ years; immediate retirement at MRA+30, 60+20 or 62+5; "MRA+10" retirement is reduced 5% for each year under 62;
// unused sick leave counts toward the annuity (not eligibility); a survivor election costs 10% (full) or 5% (partial);
// COLAs start at 62 and are capped (CPI <= 2%: CPI, 2-3%: 2%, > 3%: CPI - 1); the supplement is the age-62 Social Security
// estimate x FERS years / 40, paid to 62, and only for MRA+30 and 60+20 retirements.
// NOT modelled: law enforcement / firefighter / air traffic / CBP special provisions, CSRS, part-time service, military buyback,
// disability, involuntary or early-out retirement, the Social Security earnings test, taxes. Arithmetic, not advice.

export const SICK_HOURS_PER_YEAR = 2087;
export const AGENCY_AUTOMATIC_PCT = 1;

// Minimum retirement age in months, by birth year (5 U.S.C. 8412(g)).
export function mraMonths(birthYear) {
  if (birthYear <= 1947) return 55 * 12;
  if (birthYear <= 1952) return 55 * 12 + (birthYear - 1947) * 2;
  if (birthYear <= 1964) return 56 * 12;
  if (birthYear <= 1969) return 56 * 12 + (birthYear - 1964) * 2;
  return 57 * 12;
}

export function cola(inflationPct) {
  if (inflationPct <= 2) return inflationPct;
  if (inflationPct <= 3) return 2;
  return inflationPct - 1;
}

export function agencyPct(employeePct) {
  const match = employeePct <= 3 ? employeePct : 3 + Math.min(employeePct - 3, 2) / 2;
  return AGENCY_AUTOMATIC_PCT + match;
}

export const money = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
export const pct = (n) => (Math.round(n * 10) / 10).toLocaleString("en-US") + "%";
export const ageStr = (months) => `${Math.floor(months / 12)}${months % 12 ? ` y ${months % 12} m` : ""}`;

const num = (t) => {
  const s = String(t ?? "").replace(/[$%\s,]/g, "");
  if (s === "") return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : NaN;
};

function ym(t) {
  const m = /^\s*(\d{4})-(\d{1,2})\s*$/.exec(String(t ?? ""));
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]);
  return mo >= 1 && mo <= 12 && y >= 1900 && y <= 2200 ? { y, m: mo, months: y * 12 + mo - 1 } : null;
}
export const monthLabel = (months) => `${Math.floor(months / 12)}-${String((months % 12) + 1).padStart(2, "0")}`;

export const DEFAULTS = {
  asof: "", birth: "", scd: "", retage: "62", salary: "", raise: "2", sick: "0", sickadd: "0",
  tsp: "0", tspemp: "5", tspret: "5", tspdraw: "4", ss62: "", survivor: "none", infl: "2.5",
};
export const EXAMPLE = {
  asof: "2026-10", birth: "1970-06", scd: "2000-01", retage: "62", salary: "112000", raise: "2", sick: "1450", sickadd: "52",
  tsp: "385000", tspemp: "8", tspret: "5", tspdraw: "4", ss62: "2100", survivor: "partial", infl: "2.5",
};

// Everything that depends on the retirement month. `ctx` holds the parsed inputs and the projection helpers.
function scenario(ctx, retM) {
  const { birthM, scdM, mra, p } = ctx;
  const age = retM - birthM;
  const n = retM - ctx.asofM;
  const svcM = retM - scdM;
  const sickHours = p.sick + p.sickadd * (n / 12);
  const sickM = Math.floor((sickHours * 12) / SICK_HOURS_PER_YEAR);
  const annuityM = svcM + sickM;
  let kind = null;
  if (age >= 62 * 12 && svcM >= 60) kind = "62+5";
  else if (age >= mra && svcM >= 360) kind = "MRA+30";
  else if (age >= 60 * 12 && svcM >= 240) kind = "60+20";
  else if (age >= mra && svcM >= 120) kind = "MRA+10";
  const final = ctx.salaryAt(n);
  const out = { retM, age, n, svcM, sickM, annuityM, kind, finalSalary: final, tspBalance: ctx.tspAt(n) };
  out.high3 = ctx.high3At(n);
  if (!kind) return { ...out, eligible: false };
  const mult = age >= 62 * 12 && svcM >= 240 ? 1.1 : 1.0;
  const gross = (mult / 100) * out.high3 * (annuityM / 12);
  const reduction = kind === "MRA+10" ? Math.min(1, (Math.max(0, 62 * 12 - age) / 12) * 0.05) : 0;
  const afterReduction = gross * (1 - reduction);
  const survPct = p.survivor === "full" ? 10 : p.survivor === "partial" ? 5 : 0;
  const pension = afterReduction * (1 - survPct / 100);
  const supplementEligible = (kind === "MRA+30" || kind === "60+20") && age < 62 * 12 && p.ss62 != null;
  const supplement = supplementEligible ? p.ss62 * 12 * (svcM / 12 / 40) : 0;
  const draw = (out.tspBalance * p.tspdraw) / 100;
  const base = pension + draw;
  const income = pension + supplement + draw;
  const incomeAt62 = pension + draw + (p.ss62 || 0) * 12;
  return {
    ...out, eligible: true, mult, gross, reduction, survPct, pension, supplement, supplementEligible, draw,
    income, incomeAt62, base,
    replacement: final > 0 ? income / final : null, replacementAt62: final > 0 ? incomeAt62 / final : null,
    pensionAt: (a) => pension * Math.pow(1 + cola(p.infl) / 100, Math.max(0, a - Math.max(age / 12, 62))),
  };
}

export function analyze(input) {
  const warnings = [];
  const asof = ym(input.asof), birth = ym(input.birth), scd = ym(input.scd);
  if (!asof) warnings.push("Today's month must look like 2026-10.");
  if (!birth) warnings.push("Birth month must look like 1970-06.");
  if (!scd) warnings.push("Service start month (your service computation date) must look like 2000-01.");
  const p = {
    salary: num(input.salary), raise: num(input.raise), sick: num(input.sick) ?? 0, sickadd: num(input.sickadd) ?? 0,
    tsp: num(input.tsp) ?? 0, tspemp: num(input.tspemp) ?? 0, tspret: num(input.tspret), tspdraw: num(input.tspdraw),
    ss62: num(input.ss62), infl: num(input.infl), retage: num(input.retage),
    survivor: ["none", "partial", "full"].includes(input.survivor) ? input.survivor : "none",
  };
  const need = (v, lo, hi, msg) => { if (v === null || Number.isNaN(v) || v < lo || v > hi) warnings.push(msg); };
  need(p.salary, 1, 5e6, "Current annual salary must be a positive number.");
  need(p.raise, -10, 20, "Expected annual raise % must be between -10 and 20.");
  need(p.sick, 0, 50000, "Unused sick leave hours must be between 0 and 50,000.");
  need(p.sickadd, -2000, 2000, "Net sick leave hours added per year must be between -2,000 and 2,000.");
  need(p.tsp, 0, 1e9, "TSP balance must be zero or more.");
  need(p.tspemp, 0, 100, "Your TSP contribution % must be between 0 and 100.");
  need(p.tspret, -20, 30, "TSP return % must be between -20 and 30.");
  need(p.tspdraw, 0, 100, "TSP withdrawal % must be between 0 and 100.");
  need(p.infl, -5, 30, "Expected inflation % must be between -5 and 30.");
  need(p.retage, 40, 80, "Planned retirement age must be between 40 and 80.");
  if (p.ss62 !== null && (Number.isNaN(p.ss62) || p.ss62 < 0)) warnings.push("Social Security estimate at 62 must be zero or more, or blank.");
  if (warnings.length) return { ok: false, warnings };
  if (scd.months >= asof.months + 1) warnings.push("Your service start month is after today. Enter the month your creditable service began.");
  if (birth.months >= scd.months) warnings.push("Your service cannot start before you were born.");
  if (warnings.length) return { ok: false, warnings };

  const birthM = birth.months, scdM = scd.months, asofM = asof.months, mra = mraMonths(birth.y);
  const g = 1 + p.raise / 100;
  const salaryMonth = (k) => (p.salary * Math.pow(g, Math.floor(k / 12)));
  const salaryAt = (n) => salaryMonth(n);
  const high3At = (n) => { let s = 0; for (let k = n - 36; k < n; k++) s += salaryMonth(k); return s / 36; };
  const empPct = p.tspemp, totalPct = empPct + agencyPct(empPct);
  const mr = Math.pow(1 + p.tspret / 100, 1 / 12);
  const cache = [p.tsp];
  const tspAt = (n) => {
    for (let k = cache.length - 1; k < n; k++) cache.push(cache[k] * mr + (salaryMonth(k) / 12) * (totalPct / 100));
    return cache[Math.max(0, n)];
  };
  const ctx = { birthM, scdM, asofM, mra, p, salaryAt, high3At, tspAt };
  const ageNow = asofM - birthM;

  if (ageNow > 80 * 12) warnings.push("Your age looks above 80. Check the birth month.");
  const planM = birthM + Math.round(p.retage * 12);
  if (planM < asofM) warnings.push(`Planned retirement age ${p.retage} is already past. Pick an age no earlier than ${ageStr(ageNow)}.`);
  if (warnings.length) return { ok: false, warnings };

  const plan = scenario(ctx, planM);

  // First month each retirement type is met, scanning forward from today.
  const firsts = [];
  const seen = new Set();
  for (let m = asofM; m <= birthM + 70 * 12; m++) {
    const s = scenario(ctx, m);
    if (s.kind && !seen.has(s.kind)) { seen.add(s.kind); firsts.push({ kind: s.kind, ...s }); }
    if (seen.size === 4) break;
  }

  const rows = [];
  for (let a = Math.max(50, Math.ceil(ageNow / 12)); a <= 70; a++) rows.push(scenario(ctx, birthM + a * 12));
  // What one more year of work adds, once the previous year was already a valid retirement.
  rows.forEach((r, i) => { r.gain = r.eligible && rows[i - 1]?.eligible ? r.income - rows[i - 1].income : null; });

  if (p.ss62 === null) warnings.push("No Social Security estimate was given, so no Special Retirement Supplement is shown and the age-62 column excludes Social Security. Your estimate is on your SSA statement at ssa.gov/myaccount.");
  if (p.tspret > p.infl + 7) warnings.push("A TSP return this far above inflation is optimistic for planning. Try 4-5% nominal for a mixed allocation.");
  return { ok: true, warnings, mra, ageNow, plan, firsts, rows, cola: cola(p.infl), params: p, asofM, birthM, scdM };
}

export function toCsv(a) {
  const q = (s) => (/[",\n]/.test(String(s)) ? '"' + String(s).replace(/"/g, '""') + '"' : String(s));
  const head = ["Retire at age", "Retirement type", "Service months (annuity)", "High-3", "Annuity per year", "Supplement per year", "TSP balance", "TSP draw per year", "Income per year", "Share of final salary"];
  const rows = a.rows.map((r) => r.eligible
    ? [ageStr(r.age), r.kind, r.annuityM, r.high3.toFixed(0), r.pension.toFixed(0), r.supplement.toFixed(0), r.tspBalance.toFixed(0), r.draw.toFixed(0), r.income.toFixed(0), r.replacement == null ? "" : (r.replacement * 100).toFixed(1) + "%"]
    : [ageStr(r.age), "not eligible", r.annuityM, r.high3.toFixed(0), "", "", r.tspBalance.toFixed(0), "", "", ""]);
  return [head, ...rows].map((r) => r.map(q).join(",")).join("\n") + "\n";
}
