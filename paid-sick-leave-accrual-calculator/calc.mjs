// State paid sick leave accrual calculator for small employers. Pure functions, no I/O. Bad input is
// rejected with a message, never clamped.
// Written from memory WITHOUT network access in the building session: the statewide rates, caps and size
// thresholds below are stated as the statutes are generally summarised, but every result names a source to
// verify. City and county ordinances (Chicago, Cook County, NYC, Seattle, Portland, Philadelphia, DC and
// others) are often richer than the state rule and are NOT modelled.

export const VERIFY = "your state labor agency's paid sick leave page and the statute itself (for example Cal. Lab. Code 246, N.Y. Lab. Law 196-b, RCW 49.46.210, 820 ILCS 192, C.R.S. 8-13.3, N.J.S.A. 34:11D, M.G.L. c.149 148C); the U.S. DOL state sick leave roundup";

// per: hours worked per 1 hour accrued. use: annual use cap (hours). bal: balance (accrual) cap, null = none.
// carry: hours that carry into the next year, "bal" = up to the balance cap, "use" = up to the use cap.
// size(n) returns { applies, paid, use } for an employer of n employees; default is all employers, paid, `use`.
const ALL = () => ({ applies: true, paid: true });
export const STATES = {
  CA: { name: "California", per: 30, use: 40, bal: 80, carry: "bal", front: 40, note: "Employers may front-load 40 hours (5 days) a year instead of accruing. Unused accrual carries over, up to the 80-hour cap. Accrued PTO policies are vested wages in California and are paid out on separation.", size: ALL },
  NY: { name: "New York", per: 30, use: 40, bal: null, carry: "use", front: null, note: "Use cap depends on employer size: 4 or fewer employees 40 hours (paid only if net income over $1M), 5-99 employees 40 paid hours, 100 or more 56 paid hours. NYC has its own Earned Safe and Sick Time Act.",
    size: (n) => (n >= 100 ? { applies: true, paid: true, use: 56 } : n >= 5 ? { applies: true, paid: true, use: 40 } : { applies: true, paid: false, use: 40 }) },
  WA: { name: "Washington", per: 40, use: null, bal: null, carry: "use40", front: null, note: "No annual accrual cap. Up to 40 unused hours carry over. Applies to nearly every employee. Seattle has a separate ordinance.", size: ALL },
  IL: { name: "Illinois (outside Chicago and Cook County)", per: 40, use: 40, bal: null, carry: "use", front: 40, note: "Paid Leave for All Workers Act. Employers may front-load 40 hours. Chicago and Cook County have their own ordinances.", size: ALL },
  CO: { name: "Colorado", per: 30, use: 48, bal: null, carry: "use", front: 48, note: "Healthy Families and Workplaces Act. Public health emergency leave can add 80 hours.", size: ALL },
  NJ: { name: "New Jersey", per: 30, use: 40, bal: null, carry: "use", front: 40, note: "Earned Sick Leave Law. Front-loading 40 hours at the start of the benefit year avoids carryover.", size: ALL },
  MA: { name: "Massachusetts", per: 30, use: 40, bal: null, carry: "use", front: null, note: "Employers with 11 or more employees must provide paid leave; 10 or fewer must provide unpaid leave.",
    size: (n) => ({ applies: true, paid: n >= 11 }) },
  AZ: { name: "Arizona", per: 30, use: 40, bal: null, carry: "use", front: 40, note: "Fair Wages and Healthy Families Act. Use cap is 40 hours for employers with 15 or more employees and 24 hours for fewer.",
    size: (n) => ({ applies: true, paid: true, use: n >= 15 ? 40 : 24 }) },
  OR: { name: "Oregon", per: 30, use: 40, bal: 80, carry: "bal", front: null, note: "Employers with 10 or more employees (6 or more in Portland) provide paid leave; smaller employers provide unpaid leave. Balance is capped at 80 hours.",
    size: (n) => ({ applies: true, paid: n >= 10 }) },
  MD: { name: "Maryland", per: 30, use: 40, bal: 40, carry: "bal", front: 40, note: "Employers with 15 or more employees provide paid leave; smaller employers provide unpaid leave. Balance is capped at 40 hours.",
    size: (n) => ({ applies: true, paid: n >= 15 }) },
  MN: { name: "Minnesota", per: 30, use: 48, bal: 80, carry: "bal", front: 48, note: "Earned sick and safe time. Accrual is capped at 80 hours.", size: ALL },
  MI: { name: "Michigan", per: 30, use: 72, bal: null, carry: "use", front: 72, note: "Earned Sick Time Act. Employers with 10 or fewer employees must provide 40 hours a year; 11 or more provide 72 hours.",
    size: (n) => ({ applies: true, paid: true, use: n >= 11 ? 72 : 40 }) },
  NM: { name: "New Mexico", per: 30, use: 64, bal: null, carry: "use", front: 64, note: "Healthy Workplaces Act.", size: ALL },
  NV: { name: "Nevada", per: 52, use: 40, bal: null, carry: "use", front: 40, note: "Applies only to employers with 50 or more employees. Accrual is 0.01923 hours per hour worked.",
    size: (n) => ({ applies: n >= 50, paid: true }) },
};

export const STATE_LIST = Object.entries(STATES).map(([id, s]) => ({ id, label: s.name }));

export function parse(input) {
  const i = input || {};
  const errors = [];
  const state = Object.hasOwn(STATES, i.state) ? i.state : "";
  if (!state) errors.push("Choose the state.");
  const num = (k, label, { min = 0, max = Infinity, int = false } = {}) => {
    const raw = Number(i[k]);
    if (i[k] === undefined || i[k] === "" || i[k] === null || !Number.isFinite(raw) || raw < min || raw > max || (int && !Number.isInteger(raw))) {
      errors.push(`Enter ${label}${Number.isFinite(max) ? ` (${min} to ${max})` : ` of ${min} or more`}.`);
      return 0;
    }
    return raw;
  };
  const employees = num("employees", "the number of employees at your business (all locations)", { min: 1, int: true });
  const covered = num("covered", "how many employees you want costed", { min: 1, int: true });
  const hoursPerWeek = num("hoursPerWeek", "average paid hours per week for one employee", { min: 0.5, max: 80 });
  const wage = num("wage", "the average hourly wage in dollars", { min: 0.01, max: 1000 });
  const weeks = num("weeks", "weeks worked per year", { min: 1, max: 52 });
  return { errors, state, employees, covered, hoursPerWeek, wage, weeks };
}

const r2 = (v) => Math.round(v * 100) / 100;
export const money = (v) => "$" + Math.round(v).toLocaleString("en-US");
export const hrs = (v) => (Math.round(v * 10) / 10).toString();

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const s = STATES[p.state];
  const sz = s.size(p.employees);
  const use = sz.use ?? s.use; // annual use cap (null = no cap on use stated)
  const worked = p.hoursPerWeek * p.weeks;
  const raw = worked / s.per;
  const annualAccrual = sz.applies ? (use != null && s.bal == null ? Math.min(raw, use) : raw) : 0;
  const balCap = s.bal;
  const topBalance = !sz.applies ? 0 : balCap != null ? balCap : s.carry === "use40" ? 40 + annualAccrual : (use ?? annualAccrual) + annualAccrual;
  const perPay = { weekly: p.hoursPerWeek / s.per, biweekly: (p.hoursPerWeek * 2) / s.per, monthly: (p.hoursPerWeek * 52 / 12) / s.per };
  const findings = [];
  const annualCostEach = sz.paid ? annualAccrual * p.wage : 0;
  const maxBalanceEach = sz.paid ? topBalance * p.wage : 0;
  const frontHours = sz.applies && s.front ? Math.max(s.front, 0) : null;
  const frontEach = frontHours != null && sz.paid ? frontHours * p.wage : null;

  if (!sz.applies) {
    findings.push({ severity: "info", title: `${s.name} state law does not reach an employer with ${p.employees} employees. Check city or county rules and any policy you promised in writing.` });
  } else {
    findings.push({ severity: "high", title: `${s.name}: an employee working ${hrs(p.hoursPerWeek)} hours a week earns about ${hrs(annualAccrual)} hours of sick leave in ${p.weeks} weeks (1 hour per ${s.per} worked${use != null ? (s.bal == null ? `, capped at ${use} hours a year` : `; use is limited to ${use} hours a year and the balance to ${s.bal}`) : ", no annual accrual cap"}).` });
    findings.push({ severity: "high", title: sz.paid ? `Cost of the leave if it is all used: ${money(annualCostEach)} per employee, ${money(annualCostEach * p.covered)} for ${p.covered} employee${p.covered === 1 ? "" : "s"} a year, plus the cover shifts.` : "At your size the state requires unpaid protected leave, so the accrual is a time-off right rather than a payroll cost. Paying it anyway is a retention choice." });
    if (balCap != null) findings.push({ severity: "medium", title: `Balance cap ${balCap} hours: once an employee holds that much, accrual stops until they use some. Your largest balance liability is ${money(balCap * p.wage * p.covered)} for ${p.covered} employee${p.covered === 1 ? "" : "s"}.` });
    if (frontHours != null && sz.paid) findings.push({ severity: "info", title: `Front-loading ${frontHours} hours on day one costs ${money(frontEach * p.covered)} for ${p.covered} and removes the tracking and carryover work, but an employee who leaves early has taken the hours up front. Compare with accruing ${hrs(annualAccrual)} hours.` });
    if (p.state === "CA") findings.push({ severity: "medium", title: "A single combined PTO bank counts as vested wages in California: unused hours are paid on separation. Separate sick leave does not have to be. The split matters to your balance sheet." });
    findings.push({ severity: "info", title: "Accrual starts on the first day of work and the employee can usually use it after a short waiting period (often 90 days, or sooner under some statutes). Retaliation for using it is unlawful everywhere on this list." });
  }
  findings.push({ severity: "info", title: "Local ordinances (NYC, Chicago, Cook County, Seattle, Portland, Philadelphia, DC and others) can be richer than the state rule and are not modelled here." });

  return { errors: [], input: p, state: s, applies: sz.applies, paid: sz.paid, use, balCap, annualAccrual, perPay, worked, annualCostEach, annualCostTotal: annualCostEach * p.covered, maxBalanceEach, maxBalanceTotal: maxBalanceEach * p.covered, frontHours, frontEach, frontTotal: frontEach == null ? null : frontEach * p.covered, findings };
}

export const SAMPLE = { state: "CA", employees: 12, covered: 12, hoursPerWeek: 32, weeks: 52, wage: 22 };

export function summaryText(r) {
  const p = r.input;
  const lines = [
    "Paid sick leave accrual estimate (first read, not legal advice)",
    `State: ${r.state.name}. Employer size: ${p.employees} employees. Costing ${p.covered} employee(s) at ${hrs(p.hoursPerWeek)} h/week, $${r2(p.wage)}/h.`,
    ...r.findings.map((f) => `- ${f.title}`),
    "",
  ];
  if (r.applies) {
    lines.push(`Accrual per weekly hour: ${r.perPay.weekly.toFixed(4)} h; per two-week pay period: ${r.perPay.biweekly.toFixed(2)} h; per month: ${r.perPay.monthly.toFixed(2)} h.`);
    lines.push(`Hours accrued in a year: ${hrs(r.annualAccrual)}. State note: ${r.state.note}`);
  }
  lines.push("", `Verify against: ${VERIFY}`, "Confirm with your state labor agency or an employment lawyer.");
  return lines.join("\n");
}
