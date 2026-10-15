// Employer payroll tax and true cost of a hire. Pure functions, no I/O. Bad input is rejected with a message,
// never clamped. Federal figures are the 2026 values as generally published; state unemployment (SUI) wage
// bases and new-employer rates are STARTING POINTS written from memory without network access: every field is
// editable and the page tells the reader to replace them with the figures on their state's rate notice.

export const VERIFY = "IRS Publication 15 (Circular E) and Form 940 instructions; SSA's contribution and benefit base page; your state workforce agency's unemployment tax rate notice";

export const FED = {
  year: 2026,
  ssRate: 0.062,
  ssBase: 184500, // Social Security wage base
  medicareRate: 0.0145,
  futaGross: 0.06,
  futaCredit: 0.054,
  futaBase: 7000,
};

// base: state taxable wage base. rate: typical new-employer SUI rate (fraction). Both editable on the page.
export const STATES = {
  CA: { name: "California", base: 7000, rate: 0.034, note: "California also charges employer-paid ETT (0.1%, not modelled) and employees pay SDI." },
  TX: { name: "Texas", base: 9000, rate: 0.027, note: "" },
  FL: { name: "Florida", base: 7000, rate: 0.027, note: "" },
  NY: { name: "New York", base: 12800, rate: 0.041, note: "New York adds a re-employment fund charge and MCTMT in the NYC area (not modelled)." },
  PA: { name: "Pennsylvania", base: 10000, rate: 0.0382, note: "" },
  GA: { name: "Georgia", base: 9500, rate: 0.0264, note: "" },
  OH: { name: "Ohio", base: 9000, rate: 0.027, note: "" },
  NC: { name: "North Carolina", base: 32600, rate: 0.01, note: "North Carolina has a high wage base, so the cost keeps accruing well into the year." },
  VA: { name: "Virginia", base: 8000, rate: 0.025, note: "" },
  OTHER: { name: "Other state (enter your own)", base: 7000, rate: 0.03, note: "Enter the wage base and rate from your state's notice." },
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
  const salary = num("salary", "the annual salary or wages in dollars", { min: 1, max: 5000000 });
  const months = num("months", "months employed this year", { min: 1, max: 12, int: true });
  const hires = num("hires", "how many identical hires", { min: 1, max: 10000, int: true });
  const suiBase = num("suiBase", "the state unemployment taxable wage base in dollars", { min: 1, max: 500000 });
  const suiRate = num("suiRate", "your state unemployment tax rate in percent", { min: 0, max: 15 });
  const creditReduction = num("creditReduction", "the FUTA credit reduction in percent (0 if your state has none)", { min: 0, max: 5.4 });
  const comp = num("comp", "the workers' compensation rate in percent of payroll", { min: 0, max: 50 });
  const health = num("health", "the employer health premium in dollars per month", { min: 0, max: 20000 });
  const match = num("match", "the retirement match in percent of pay", { min: 0, max: 100 });
  return { errors, state, salary, months, hires, suiBase, suiRate, creditReduction, comp, health, match };
}

const r2 = (v) => Math.round(v * 100) / 100;
export const money = (v) => "$" + Math.round(v).toLocaleString("en-US");
export const pct = (v) => (Math.round(v * 1000) / 10).toString() + "%";

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const s = STATES[p.state];
  const wages = p.salary * (p.months / 12); // wages actually paid this calendar year
  const ss = Math.min(wages, FED.ssBase) * FED.ssRate;
  const medicare = wages * FED.medicareRate;
  const futaRate = FED.futaGross - FED.futaCredit + p.creditReduction / 100;
  const futa = Math.min(wages, FED.futaBase) * futaRate;
  const sui = Math.min(wages, p.suiBase) * (p.suiRate / 100);
  const compCost = wages * (p.comp / 100);
  const matchCost = wages * (p.match / 100);
  const healthCost = p.health * p.months;
  const payrollTaxes = ss + medicare + futa + sui;
  const burden = payrollTaxes + compCost + matchCost + healthCost;
  const total = wages + burden;
  const firstDollarsTax = Math.min(wages, Math.min(FED.futaBase, p.suiBase)) * (futaRate + p.suiRate / 100);
  const findings = [];

  findings.push({ severity: "high", title: `${money(wages)} of wages${p.months < 12 ? ` (${p.months} months of a ${money(p.salary)} salary)` : ""} costs you about ${money(total)} per hire: ${money(burden)} on top of pay, ${pct(burden / wages)} of wages.` });
  findings.push({ severity: "medium", title: `Payroll taxes alone are ${money(payrollTaxes)} (${pct(payrollTaxes / wages)} of wages): Social Security ${money(ss)}, Medicare ${money(medicare)}, federal unemployment (FUTA) ${money(futa)}, state unemployment ${money(sui)}.` });
  if (wages <= Math.max(FED.futaBase, p.suiBase)) findings.push({ severity: "medium", title: `Unemployment taxes are front-loaded: the first ${money(Math.min(FED.futaBase, p.suiBase))} of pay carries ${pct(futaRate + p.suiRate / 100)} of FUTA and state tax on top of the 7.65% FICA. A low-earning or short-stint hire therefore costs proportionally more.` });
  else findings.push({ severity: "info", title: `Federal and state unemployment taxes stop after the first ${money(Math.min(FED.futaBase, p.suiBase))}-${money(Math.max(FED.futaBase, p.suiBase))} of pay, so most of the cost over that is FICA, comp, health and match.` });
  if (p.creditReduction > 0) findings.push({ severity: "medium", title: `A FUTA credit reduction of ${p.creditReduction}% adds ${money(Math.min(wages, FED.futaBase) * p.creditReduction / 100)} per hire this year. It applies when your state has an unpaid federal unemployment loan.` });
  if (wages > FED.ssBase) findings.push({ severity: "info", title: `Pay above the ${money(FED.ssBase)} Social Security wage base is not charged the 6.2% employer share (Medicare is uncapped).` });
  if (s.note) findings.push({ severity: "info", title: s.note });
  findings.push({ severity: "info", title: "Not modelled: paid leave and holiday cost, state disability or family-leave contributions, local taxes, recruiting, equipment and training, the 0.9% additional Medicare tax (employee-side), tax credits such as WOTC, and your experience-rated SUI rate after the first years." });

  const rows = [
    ["Wages paid this year", wages],
    ["Social Security (6.2% to the wage base)", ss],
    ["Medicare (1.45%)", medicare],
    [`Federal unemployment (FUTA, ${pct(futaRate)} on first ${money(FED.futaBase)})`, futa],
    [`State unemployment (${p.suiRate}% on first ${money(p.suiBase)})`, sui],
    [`Workers' compensation (${p.comp}%)`, compCost],
    [`Retirement match (${p.match}%)`, matchCost],
    ["Employer health premium", healthCost],
  ];
  return { errors: [], input: p, state: s, wages, ss, medicare, futa, futaRate, sui, compCost, matchCost, healthCost, payrollTaxes, burden, burdenRate: burden / wages, total, totalAll: total * p.hires, firstDollarsTax, rows, findings };
}

export const SAMPLE = { state: "TX", salary: 52000, months: 12, hires: 1, suiBase: 9000, suiRate: 2.7, creditReduction: 0, comp: 1.5, health: 450, match: 3 };

export function summaryText(r) {
  const p = r.input;
  const lines = [
    "Employer payroll tax and true cost of a hire (estimate, not tax advice)",
    `State: ${r.state.name}. Salary ${money(p.salary)}, ${p.months} month(s) this year, ${p.hires} hire(s).`,
    ...r.findings.map((f) => `- ${f.title}`),
    "",
    ...r.rows.map(([k, v]) => `${k}: ${money(v)}`),
    `Total employer cost per hire: ${money(r.total)} (${pct(r.burdenRate)} on top of wages).`,
    p.hires > 1 ? `For ${p.hires} hires: ${money(r.totalAll)}.` : "",
    "",
    `Verify against: ${VERIFY}`,
    "Confirm with your payroll provider, CPA or state agency.",
  ].filter((l, i, a) => l !== "" || a[i - 1] !== "");
  return lines.join("\n");
}
