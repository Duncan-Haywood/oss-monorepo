// Dependent care FSA vs child and dependent care credit: how much of a
// year's care spending to run through the employer FSA and how much to leave
// for the federal credit. Pure arithmetic on numbers the visitor types with
// flat marginal rates the visitor chooses; no network, no tax tables.
//
// Rules modelled (US federal, tax years after 2025; check the current year):
//  - FSA exclusion limit $7,500 per household ($3,750 if married filing
//    separately, not modelled).
//  - Credit: expense cap $3,000 for one qualifying person, $6,000 for two or
//    more, reduced dollar for dollar by the FSA exclusion. Credit rate 50%,
//    minus one point per $2,000 (or part) of AGI over $15,000, to a floor of
//    35%; then minus one point per $2,000 (or part) of AGI over $75,000
//    ($150,000 joint), to a floor of 20%. FSA dollars lower AGI.
//  - Both are limited to the lower-earning spouse's earned income.

export const FSA_LIMIT = 7500;
export const CAP_ONE = 3000;
export const CAP_TWO = 6000;

export function parseNum(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/[$,\s]/g, "").replace(/%$/, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export function money(n) {
  return Math.round(n).toLocaleString("en-US");
}

// Credit rate as a fraction for a given AGI and filing status.
export function creditRate(agi, joint) {
  let rate = 50;
  if (agi > 15000) rate = Math.max(35, 50 - Math.ceil((agi - 15000) / 2000));
  const second = joint ? 150000 : 75000;
  if (agi > second) rate = Math.min(rate, Math.max(20, 35 - Math.ceil((agi - second) / 2000)));
  return rate / 100;
}

// Tax saved by putting `fsa` dollars through the FSA and claiming the credit
// on what is left.
export function savings(p, fsa) {
  const eligible = Math.min(p.expenses, p.earned ?? Infinity);
  const cap = p.children >= 2 ? CAP_TWO : CAP_ONE;
  const fsaSaved = fsa * (p.fedRate + p.stateRate + p.ficaRate);
  const qualified = Math.max(0, Math.min(eligible, cap) - fsa);
  const rate = creditRate(Math.max(0, p.agi - fsa), p.joint);
  const uncapped = qualified * rate;
  const credit = Math.min(uncapped, p.taxBefore ?? Infinity);
  return { fsa, fsaSaved, qualified, rate, credit, creditLimited: credit < uncapped, total: fsaSaved + credit };
}

export function parseInput(raw) {
  const num = (k) => parseNum(raw[k]);
  const p = {
    joint: raw.status !== "single",
    children: num("children"),
    expenses: num("expenses"),
    agi: num("agi"),
    fedRate: num("fedRate"),
    stateRate: num("stateRate") ?? 0,
    ficaRate: num("ficaRate") ?? 7.65,
    earned: num("earned"),
    taxBefore: num("taxBefore"),
  };
  for (const k of ["children", "expenses", "agi", "fedRate"]) {
    if (p[k] === null) return { error: `Enter a number for ${LABELS[k]}.` };
  }
  for (const k of ["children", "expenses", "agi", "fedRate", "stateRate", "ficaRate", "earned", "taxBefore"]) {
    if (Number.isNaN(p[k])) return { error: `${LABELS[k]} must be a number.` };
    if (p[k] !== null && p[k] < 0) return { error: `${LABELS[k]} cannot be negative.` };
  }
  if (p.children < 1 || !Number.isInteger(p.children)) return { error: "Enter 1 or more qualifying children or dependents (a whole number)." };
  if (p.fedRate > 60 || p.stateRate > 30 || p.ficaRate > 20) return { error: "A tax rate looks too high. Enter percentages such as 22, 5 and 7.65." };
  p.fedRate /= 100;
  p.stateRate /= 100;
  p.ficaRate /= 100;
  return p;
}

const LABELS = {
  children: "qualifying children",
  expenses: "care expenses",
  agi: "household AGI",
  fedRate: "your federal marginal rate",
  stateRate: "your state rate",
  ficaRate: "the payroll tax rate",
  earned: "the lower earner's income",
  taxBefore: "federal income tax before credits",
};

export function analyze(raw) {
  const p = parseInput(raw);
  if (p.error) return p;
  const eligible = Math.min(p.expenses, p.earned ?? Infinity);
  const fsaMax = Math.min(FSA_LIMIT, eligible);
  const candidates = new Set([0, fsaMax]);
  for (let f = 50; f < fsaMax; f += 50) candidates.add(f);
  let best = savings(p, 0);
  for (const f of [...candidates].sort((a, b) => a - b)) {
    const s = savings(p, f);
    if (s.total > best.total + 1e-9) best = s;
  }
  const creditOnly = savings(p, 0);
  const fsaMaxed = savings(p, fsaMax);
  const scenarios = [
    { label: "Credit only (no FSA)", ...creditOnly },
    { label: `Maximum FSA ($${money(fsaMax)})`, ...fsaMaxed },
    { label: "Best split", ...best },
  ];
  const findings = [];
  const gain = best.total - Math.max(creditOnly.total, fsaMaxed.total);
  if (best.fsa === 0) {
    findings.push({ severity: "info", title: "The credit beats the FSA for you", detail: `At your rates the credit saves about $${money(creditOnly.total)}, more than any FSA election. This usually happens at lower incomes where the credit rate is 35% to 50%.` });
  } else if (best.fsa === fsaMax) {
    findings.push({ severity: "info", title: "Put the most you can through the FSA", detail: `Electing $${money(fsaMax)} saves about $${money(best.total)} against $${money(creditOnly.total)} for the credit alone.` });
  } else {
    findings.push({ severity: "info", title: "A split beats either extreme", detail: `Electing about $${money(best.fsa)} and claiming the credit on the rest saves about $${money(best.total)}, $${money(gain)} more than the better single route.` });
  }
  if (best.creditLimited) {
    findings.push({ severity: "medium", title: "The credit is limited by your tax", detail: "The credit cannot exceed your federal income tax before credits, so part of it would be lost. The FSA is not limited this way." });
  }
  if (p.earned !== null && p.earned < p.expenses) {
    findings.push({ severity: "medium", title: "Lower earner's income limits the amount", detail: `Both the FSA and the credit are limited to the lower earner's income, so only $${money(eligible)} of your $${money(p.expenses)} counts.` });
  }
  if (p.expenses < FSA_LIMIT && best.fsa === fsaMax && fsaMax === p.expenses) {
    findings.push({ severity: "info", title: "Elect only what you will spend", detail: "An FSA is use-it-or-lose-it (subject to your plan's grace period). Elect no more than the care you are sure to pay for." });
  }
  return { input: p, eligible, fsaMax, best, creditOnly, fsaMaxed, scenarios, findings };
}

export function sampleInput() {
  return { status: "joint", children: "2", expenses: "14000", agi: "165000", fedRate: "24", stateRate: "5", ficaRate: "7.65", earned: "70000", taxBefore: "" };
}

const csv = (v) => `"${String(v).replace(/"/g, '""')}"`;

export function reportCsv(a) {
  const rows = [["Scenario", "FSA election", "FSA tax saved", "Qualified for credit", "Credit rate", "Credit", "Total saved"]];
  for (const s of a.scenarios) {
    rows.push([s.label, s.fsa.toFixed(2), s.fsaSaved.toFixed(2), s.qualified.toFixed(2), (s.rate * 100).toFixed(0) + "%", s.credit.toFixed(2), s.total.toFixed(2)]);
  }
  return rows.map((r) => r.map(csv).join(",")).join("\n") + "\n";
}
