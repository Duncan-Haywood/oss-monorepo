// Small-employer retirement plan startup credit (IRC 45E, as amended by SECURE 2.0). Pure functions, no I/O.
// Bad input is rejected with a message, never clamped. Figures are as generally published for plans started after 2022;
// the per-employee pay cap is indexed each year, so it is an editable field.

export const VERIFY = "IRS Form 8881 and its instructions; IRS 'Retirement plans startup costs tax credit' page; IRC section 45E";

export const RULES = {
  startupCapPerNhce: 250, // 50% credit cap is the greater of $500 or $250 x eligible non-highly-compensated employees
  startupCapMin: 500,
  startupCapMax: 5000,
  contribCapPerEmployee: 1000,
  autoEnrollCredit: 500,
  startupYears: 3,
  contribPctByYear: [1, 1, 0.75, 0.5, 0.25], // years 1-5 of the plan
  smallEmployerMax: 50, // 100% startup credit and full contribution credit at or under this
  maxEmployees: 100,
};

export function parse(input) {
  const i = input || {};
  const errors = [];
  const num = (k, label, { min = 0, max = Infinity, int = false } = {}) => {
    const raw = Number(i[k]);
    if (i[k] === undefined || i[k] === "" || i[k] === null || !Number.isFinite(raw) || raw < min || raw > max || (int && !Number.isInteger(raw))) {
      errors.push(`Enter ${label}${Number.isFinite(max) ? ` (${min} to ${max})` : ` of ${min} or more`}.`);
      return 0;
    }
    return raw;
  };
  const employees = num("employees", "how many employees you have (earning $5,000 or more last year)", { min: 1, max: 100000, int: true });
  const nhce = num("nhce", "how many non-highly-compensated employees are eligible for the plan", { min: 0, max: 100000, int: true });
  const startupCost = num("startupCost", "yearly setup and administration cost in dollars", { min: 0, max: 10000000 });
  const eligibleContribEmployees = num("contribEmployees", "how many employees you contribute for who earn under the pay cap (exclude owners)", { min: 0, max: 100000, int: true });
  const contribPerEmployee = num("contribPerEmployee", "the average employer contribution per employee in dollars", { min: 0, max: 1000000 });
  const payCap = num("payCap", "the indexed pay cap for the contribution credit in dollars", { min: 1, max: 1000000 });
  const taxRate = num("taxRate", "your marginal tax rate in percent", { min: 0, max: 60 });
  const autoEnroll = i.autoEnroll === true || i.autoEnroll === "true" || i.autoEnroll === "on" || i.autoEnroll === "1";
  const noPriorPlan = i.noPriorPlan === true || i.noPriorPlan === "true" || i.noPriorPlan === "on" || i.noPriorPlan === "1";
  if (!errors.length && nhce > employees) errors.push("Eligible non-highly-compensated employees cannot exceed total employees.");
  if (!errors.length && eligibleContribEmployees > employees) errors.push("Employees you contribute for cannot exceed total employees.");
  return { errors, employees, nhce, startupCost, contribEmployees: eligibleContribEmployees, contribPerEmployee, payCap, taxRate, autoEnroll, noPriorPlan };
}

export const money = (v) => "$" + Math.round(v).toLocaleString("en-US");
export const pct = (v) => (Math.round(v * 1000) / 10).toString() + "%";

// One plan year (1-based). Pure; used by compute for the five-year table.
export function creditForYear(p, year) {
  const R = RULES;
  const startupShare = p.employees <= R.smallEmployerMax ? 1 : 0.5;
  const startupCap = Math.min(R.startupCapMax, Math.max(R.startupCapMin, R.startupCapPerNhce * p.nhce));
  const startup = year <= R.startupYears ? Math.min(p.startupCost * startupShare, startupCap) : 0;
  const auto = p.autoEnroll && year <= R.startupYears ? R.autoEnrollCredit : 0;
  const phaseOut = p.employees <= R.smallEmployerMax ? 1 : Math.max(0, 1 - 0.02 * (p.employees - R.smallEmployerMax));
  const yearPct = R.contribPctByYear[year - 1] ?? 0;
  const perEmp = Math.min(p.contribPerEmployee, R.contribCapPerEmployee);
  const contrib = p.contribEmployees * perEmp * yearPct * phaseOut;
  return { year, startup, auto, contrib, total: startup + auto + contrib, startupCap, phaseOut, yearPct };
}

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const findings = [];
  const eligible = p.employees <= RULES.maxEmployees && p.noPriorPlan;
  const years = [1, 2, 3, 4, 5].map((y) => (eligible ? creditForYear(p, y) : { year: y, startup: 0, auto: 0, contrib: 0, total: 0, startupCap: 0, phaseOut: 0, yearPct: 0 }));
  const total5 = years.reduce((s, y) => s + y.total, 0);
  // The deduction for plan costs and contributions is reduced by the credit taken, so the credit nets against the tax saved.
  const costs5 = p.startupCost * RULES.startupYears + p.contribEmployees * p.contribPerEmployee * 5;
  const lostDeduction = total5 * (p.taxRate / 100);
  const netBenefit = total5 - lostDeduction;
  const y1 = years[0];

  if (p.employees > RULES.maxEmployees) findings.push({ severity: "high", title: `With ${p.employees} employees you are over the 100-employee limit, so the credit is not available. (Count employees who earned $5,000 or more last year.)` });
  else if (!p.noPriorPlan) findings.push({ severity: "high", title: "You (or a controlled-group member) had a plan for substantially the same employees in the last 3 years, so the credit is not available. Confirm with your plan provider." });
  else {
    findings.push({ severity: "high", title: `Year 1 credit: ${money(y1.total)} (setup ${money(y1.startup)}${y1.auto ? `, auto-enrolment ${money(y1.auto)}` : ""}, employer-contribution ${money(y1.contrib)}). Over five years: ${money(total5)}.` });
    findings.push({ severity: "medium", title: p.employees <= RULES.smallEmployerMax ? `At ${p.employees} employees you are in the 50-or-fewer tier: 100% of setup costs (up to the ${money(y1.startupCap)} cap) and the full contribution credit.` : `At ${p.employees} employees the setup credit is 50% of costs, and the contribution credit is reduced by ${pct(1 - y1.phaseOut)} (2% for each employee over 50).` });
    if (p.startupCost * (p.employees <= RULES.smallEmployerMax ? 1 : 0.5) > y1.startupCap && y1.startup > 0) findings.push({ severity: "info", title: `Your setup costs exceed the cap, so the credit stops at ${money(y1.startupCap)} a year: the cap is the greater of $500 or $250 x ${p.nhce} eligible non-highly-compensated employees, never over $5,000.` });
    if (p.contribPerEmployee > RULES.contribCapPerEmployee) findings.push({ severity: "info", title: `Contributions above ${money(RULES.contribCapPerEmployee)} per employee earn no extra credit.` });
    findings.push({ severity: "info", title: `The credit is a general business credit claimed on Form 8881. Your deduction for the same costs shrinks by the credit, so after tax at ${p.taxRate}% the five-year benefit is about ${money(netBenefit)}.` });
  }
  findings.push({ severity: "info", title: "Not modelled: excluding owners and highly compensated employees from the contribution credit, controlled-group aggregation, electing to claim the credit in the year before the plan starts, tax-exempt employers, and the pay cap changing each year. Your plan provider or CPA decides these." });

  return { errors: [], input: p, eligible, years, total5, costs5, lostDeduction, netBenefit, findings };
}

export const SAMPLE = { employees: 12, nhce: 10, startupCost: 3000, contribEmployees: 10, contribPerEmployee: 1500, payCap: 100000, taxRate: 24, autoEnroll: true, noPriorPlan: true };

export function summaryText(r) {
  const p = r.input;
  const lines = [
    "Small-employer retirement plan startup credit (estimate, not tax advice)",
    `${p.employees} employees, ${p.nhce} eligible non-highly-compensated. Setup cost ${money(p.startupCost)} a year; contribution ${money(p.contribPerEmployee)} for ${p.contribEmployees} employees.`,
    ...r.findings.map((f) => `- ${f.title}`),
    "",
    ...r.years.map((y) => `Year ${y.year}: setup ${money(y.startup)} + auto-enrol ${money(y.auto)} + contribution ${money(y.contrib)} = ${money(y.total)}`),
    `Five-year credit: ${money(r.total5)}. After-tax benefit about ${money(r.netBenefit)}.`,
    "",
    `Verify against: ${VERIFY}`,
    "Confirm with your plan provider or CPA.",
  ];
  return lines.join("\n");
}
