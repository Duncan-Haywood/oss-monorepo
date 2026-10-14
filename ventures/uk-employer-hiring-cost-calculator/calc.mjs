// UK cost of hiring an employee: salary + employer National Insurance + workplace pension + extras (Great Britain).
// Pure functions, no I/O. Bad input is rejected with a message, never clamped.
// Written from memory WITHOUT network access in the building session. Modelled, per tax year:
//   2025/26 (from 6 April 2025): employer Class 1 NIC 15% above a secondary threshold of GBP 5,000 a year; Employment Allowance GBP 10,500.
//   2024/25 (for the "what changed" comparison): 13.8% above GBP 9,100; Employment Allowance GBP 5,000.
//   2026/27 uses the 2025/26 rates (thresholds assumed frozen; check the Budget and GOV.UK).
// Automatic-enrolment minimum employer pension 3% of qualifying earnings (GBP 6,240 to GBP 50,270), or a percentage of full salary if you pay that way.
// Employees under 21 (and apprentices under 25) have no employer NIC on earnings up to GBP 50,270 a year.
// NOT modelled: the apprenticeship levy (0.5% of payroll above GBP 3m), Employment Allowance eligibility tests, veterans' relief, freeport/investment-zone relief,
// benefits in kind (Class 1A), part-year proration, Scotland/Wales/Northern Ireland differences, and anything changed after this was written.

export const VERIFY = "GOV.UK 'Rates and thresholds for employers' (gov.uk/guidance/rates-and-thresholds-for-employers-2025-to-2026), 'Employment Allowance', 'Workplace pensions: employer duties' and The Pensions Regulator's automatic-enrolment thresholds";
export const YEARS = {
  "2025": { label: "2025/26", rate: 0.15, threshold: 5000, allowance: 10500 },
  "2026": { label: "2026/27 (assumes 2025/26 rates)", rate: 0.15, threshold: 5000, allowance: 10500 },
  "2024": { label: "2024/25", rate: 0.138, threshold: 9100, allowance: 5000 },
};
export const UST = 50270; // upper secondary threshold, under-21s and apprentices under 25
export const PENSION_LOWER = 6240;
export const PENSION_UPPER = 50270;
export const MIN_PENSION = 0.03;
export const MAX_SALARY = 1000000;

const r2 = (n) => Math.round(n * 100) / 100;
const money = (n) => (n < 0 ? "-" : "") + "GBP " + Number(Math.round(Math.abs(n) * 100) / 100).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const BASES = { qualifying: "Qualifying earnings (GBP 6,240 to GBP 50,270)", full: "Full salary" };
export const STATUS = { standard: "Standard employee", under21: "Employee under 21", apprentice: "Apprentice under 25" };

export function parse(input) {
  const i = input || {};
  const errors = [];
  const num = (key, label, { allowEmpty = true, min = 0, max = Infinity } = {}) => {
    const v = i[key];
    if (v === undefined || v === null || v === "") { if (allowEmpty) return 0; errors.push(`Enter ${label}.`); return 0; }
    const n = Number(v);
    if (!Number.isFinite(n) || n < min || n > max) { errors.push(`Enter ${label} as a number from ${min} to ${max === Infinity ? "any amount" : max}.`); return 0; }
    return n;
  };
  const year = i.year === undefined || i.year === "" ? "2025" : String(i.year);
  if (!YEARS[year]) errors.push("Pick a tax year.");
  const status = i.status === undefined || i.status === "" ? "standard" : i.status;
  if (!STATUS[status]) errors.push("Pick the employee's status.");
  const basis = i.basis === undefined || i.basis === "" ? "qualifying" : i.basis;
  if (!BASES[basis]) errors.push("Pick the pension basis.");
  return {
    errors, year, status, basis,
    salary: num("salary", "the annual gross salary", { allowEmpty: false, max: MAX_SALARY }),
    pensionPct: num("pensionPct", "the employer pension percentage", { max: 100 }),
    allowanceLeft: num("allowanceLeft", "the Employment Allowance still unused (GBP)", { max: 20000 }),
    equipment: num("equipment", "equipment and software per year (GBP)", { max: 1000000 }),
    recruitment: num("recruitment", "one-off recruitment cost (GBP)", { max: 1000000 }),
    training: num("training", "training per year (GBP)", { max: 1000000 }),
    benefits: num("benefits", "other benefits per year (GBP)", { max: 1000000 }),
  };
}

export function employerNic(salary, yr, status) {
  const ni = Math.max(0, salary - yr.threshold) * yr.rate;
  if (status !== "standard") {
    // Zero rate up to the UST; standard rate only on pay above it.
    return Math.max(0, salary - Math.max(yr.threshold, UST)) * yr.rate;
  }
  return ni;
}

export function pension(salary, pct, basis) {
  const base = basis === "full" ? salary : Math.max(0, Math.min(salary, PENSION_UPPER) - PENSION_LOWER);
  return base * (pct / 100);
}

function cost(p, salary, yr) {
  const nicGross = employerNic(salary, yr, p.status);
  const allowanceUsed = Math.min(nicGross, p.allowanceLeft);
  const nic = nicGross - allowanceUsed;
  const pen = pension(salary, p.pensionPct, p.basis);
  const running = salary + nic + pen + p.equipment + p.training + p.benefits;
  return { nicGross, allowanceUsed, nic, pen, running };
}

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const yr = YEARS[p.year];
  const c = cost(p, p.salary, yr);
  const firstYear = c.running + p.recruitment;
  const onCost = p.salary > 0 ? (c.running - p.salary) / p.salary : 0;
  const old = cost(p, p.salary, YEARS["2024"]);
  const nicChange = r2(c.nicGross - employerNic(p.salary, YEARS["2024"], p.status));
  const findings = [];
  const obligations = [];
  findings.push({ severity: "high", title: `Hiring at ${money(p.salary)} costs about ${money(c.running)} a year to run (${money(c.running / 12)} a month), and ${money(firstYear)} in the first year with recruitment. That is ${r2(onCost * 100)}% on top of salary.` });
  findings.push({ severity: "high", title: `Employer National Insurance is ${money(c.nicGross)} (${r2(yr.rate * 100)}% above ${money(yr.threshold)})${c.allowanceUsed > 0 ? `, of which Employment Allowance covers ${money(c.allowanceUsed)}, leaving ${money(c.nic)} to pay` : ""}.` });
  if (p.status !== "standard") findings.push({ severity: "info", title: `Employer NIC is zero on earnings up to ${money(UST)} for ${p.status === "under21" ? "employees under 21" : "apprentices under 25"}. Check the age and apprenticeship framework conditions on GOV.UK.` });
  if (p.pensionPct > 0 && p.pensionPct < MIN_PENSION * 100) findings.push({ severity: "high", title: `Your pension percentage is below the ${MIN_PENSION * 100}% automatic-enrolment minimum employer contribution.` });
  if (p.pensionPct === 0 && p.salary > PENSION_LOWER) findings.push({ severity: "medium", title: `No employer pension entered. If the employee is aged 22 to State Pension age and earns over GBP 10,000 a year, you must enrol them and pay at least 3% of qualifying earnings (${money(pension(p.salary, 3, "qualifying"))} a year on this salary).` });
  if (p.year !== "2024") findings.push({ severity: "info", title: `Compared with 2024/25 rates, employer NIC on this salary is ${nicChange >= 0 ? "up" : "down"} ${money(Math.abs(nicChange))} a year (${money(old.nicGross)} before, ${money(c.nicGross)} now), before Employment Allowance.` });
  findings.push({ severity: "info", title: "Not modelled: apprenticeship levy, benefits in kind (Class 1A), Employment Allowance eligibility, part-year hiring, and anything that changed after this was written." });
  obligations.push({ ref: "Register", title: "Register as an employer with HMRC", why: "You need PAYE set up before the first payday, and must report pay in real time (RTI) on or before each payday." });
  obligations.push({ ref: "Pension", title: "Set up a workplace pension", why: "Eligible jobholders must be automatically enrolled; you must declare compliance to The Pensions Regulator." });
  obligations.push({ ref: "Insure", title: "Take out employers' liability insurance", why: "Most employers need at least GBP 5m cover from the first day; the fine for none can be up to GBP 2,500 a day." });
  obligations.push({ ref: "Allowance", title: "Claim Employment Allowance", why: "It is claimed through payroll software, not automatically. It is not available if the only paid employee is also a director." });
  const budget = affordableSalary(p, firstYear, yr);
  return {
    errors: [], year: p.year, yearLabel: yr.label, salary: p.salary, nicGross: r2(c.nicGross), allowanceUsed: r2(c.allowanceUsed), nic: r2(c.nic), pension: r2(c.pen),
    equipment: p.equipment, training: p.training, benefits: p.benefits, recruitment: p.recruitment, running: r2(c.running), monthly: r2(c.running / 12), firstYear: r2(firstYear),
    onCost: r2(onCost * 100), nicChange, nicOld: r2(old.nicGross), budgetSalary: budget, findings, obligations,
  };
}

// Highest salary whose first-year cost fits a budget equal to this hire's first-year cost, shown as a sanity check on round-trips.
function affordableSalary(p, target, yr) {
  let lo = 0, hi = MAX_SALARY;
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    const c = cost(p, mid, yr);
    if (c.running + p.recruitment <= target) lo = mid; else hi = mid;
  }
  return r2(lo);
}

// What salary can a total annual budget buy?
export function salaryForBudget(input) {
  const p = parse({ ...input, salary: 0 });
  const budget = Number(input && input.budget);
  const errors = p.errors.filter((e) => !/annual gross salary/.test(e));
  if (!Number.isFinite(budget) || budget <= 0) errors.push("Enter a total yearly budget above zero.");
  if (errors.length) return { errors };
  const yr = YEARS[p.year];
  if (cost(p, 0, yr).running > budget) return { errors: [], salary: 0, note: "The extras alone exceed this budget." };
  let lo = 0, hi = MAX_SALARY;
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    if (cost(p, mid, yr).running <= budget) lo = mid; else hi = mid;
  }
  return { errors: [], salary: r2(lo), note: "" };
}

export const SAMPLE = { year: "2025", status: "standard", basis: "qualifying", salary: 35000, pensionPct: 3, allowanceLeft: 0, equipment: 1500, recruitment: 3000, training: 500, benefits: 0, budget: 50000 };

export function summaryText(r) {
  const L = ["UK cost of hiring an employee", "", `Tax year: ${r.yearLabel}`, `Salary: ${money(r.salary)}`, `Employer NIC: ${money(r.nicGross)}${r.allowanceUsed ? ` (less Employment Allowance ${money(r.allowanceUsed)} = ${money(r.nic)})` : ""}`,
    `Employer pension: ${money(r.pension)}`, `Equipment and software: ${money(r.equipment)}`, `Training: ${money(r.training)}`, `Other benefits: ${money(r.benefits)}`,
    `Annual running cost: ${money(r.running)} (${money(r.monthly)} a month, ${r.onCost}% on top of salary)`, `First-year cost with recruitment ${money(r.recruitment)}: ${money(r.firstYear)}`, "",
    ...r.findings.map((f) => `- ${f.title}`), "", ...r.obligations.map((o) => `- ${o.title}: ${o.why}`), "", `Verify against: ${VERIFY}`, "Not tax or legal advice. No warranty."];
  return L.join("\n");
}
