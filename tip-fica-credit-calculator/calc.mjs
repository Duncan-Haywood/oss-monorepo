// Employer FICA credit on employee tips (IRC section 45B, Form 8846): restaurants, bars, delivery
// and, for tips received after 2024, beauty-service businesses. Pure functions, no dependencies,
// nothing leaves the browser. Rates and the wage base are editable inputs because they change:
// check the current Social Security wage base and Form 8846 instructions before relying on a figure.
//
// The rule modelled: the credit is the employer's share of Social Security and Medicare tax on
// the part of an employee's tips that exceeds what is needed to bring the cash wage up to the
// fixed $5.15 an hour (the federal minimum wage on 1 January 2007, which never moves). Tips
// above the Social Security wage base only earn the Medicare part.

export const DEFAULTS = {
  employees:
    "Maria, 2.13, 1500, 24000\nJake, 2.13, 1200, 18000\nPriya, 15, 1800, 9000\nSam, 5.15, 2000, 200000",
  baselineWage: 5.15,
  ssRate: 6.2,
  medicareRate: 1.45,
  wageBase: 184500,
  taxRate: 25,
  priorYears: 2,
};

export function num(v) {
  if (typeof v === "number") return v;
  const n = Number(String(v ?? "").replace(/[$,%\s]/g, ""));
  return String(v ?? "").trim() === "" ? NaN : n;
}

const nz = (x) => (Number.isFinite(x) && x > 0 ? x : 0);

export function money(x) {
  const n = Math.round(x);
  return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US");
}
export function money2(x) {
  return (x < 0 ? "-$" : "$") + Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// "name, cash wage per hour, hours worked, tips reported" per line. Lines that do not parse are
// returned in `skipped` rather than silently dropped, so a typo cannot quietly shrink the credit.
export function parseEmployees(text) {
  const rows = [];
  const skipped = [];
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(/[,\t;]/).map((s) => s.trim());
    if (parts.length < 4) { skipped.push(line); continue; }
    const [name, w, h, t] = parts;
    const wage = num(w), hours = num(h), tips = num(t);
    if (![wage, hours, tips].every(Number.isFinite) || wage < 0 || hours < 0 || tips < 0) { skipped.push(line); continue; }
    rows.push({ name: name || `Employee ${rows.length + 1}`, wage, hours, tips });
  }
  return { rows, skipped };
}

// One employee, one year. Tips that merely bring the wage to the baseline come off first and use
// up Social Security wage base first, which is the cautious reading when the order is unclear.
export function creditFor(emp, o) {
  const base = nz(o.baselineWage), ss = nz(o.ssRate) / 100, med = nz(o.medicareRate) / 100, cap = nz(o.wageBase);
  const cashWages = emp.wage * emp.hours;
  const topUp = Math.max(0, base - emp.wage) * emp.hours;
  const creditable = Math.max(0, emp.tips - topUp);
  const notCreditable = emp.tips - creditable;
  const room = Math.max(0, cap - cashWages - notCreditable);
  const ssTips = Math.min(creditable, room);
  const credit = ssTips * ss + creditable * med;
  const employerFicaOnTips = Math.min(emp.tips, Math.max(0, cap - cashWages)) * ss + emp.tips * med;
  return { ...emp, cashWages, topUp, creditable, notCreditable, ssTips, credit, employerFicaOnTips };
}

export function analyze(o) {
  const { rows, skipped } = parseEmployees(o.employees);
  const staff = rows.map((r) => creditFor(r, o));
  const sum = (k) => staff.reduce((a, r) => a + r[k], 0);
  const credit = sum("credit");
  const tax = Math.min(Math.max(nz(o.taxRate), 0), 100) / 100;
  // The wage deduction is reduced by the credit, so a profitable business keeps credit x (1 - rate).
  const afterTax = credit * (1 - tax);
  const years = Math.max(0, Math.floor(nz(o.priorYears)));
  return {
    staff,
    skipped,
    totals: {
      tips: sum("tips"),
      creditable: sum("creditable"),
      notCreditable: sum("notCreditable"),
      employerFicaOnTips: sum("employerFicaOnTips"),
      credit,
      afterTax,
      years,
      priorYearsCredit: credit * years,
    },
    ranked: [...staff].sort((a, b) => b.credit - a.credit),
  };
}
