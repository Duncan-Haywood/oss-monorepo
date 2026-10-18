// Workers' compensation premium arithmetic for a small employer.
//
// Every rate here is typed in by the user from their own quote or policy
// declarations page -- this module ships no class-code rate table, because
// rates differ by state, carrier and year and a stale table is the one way
// to make this tool wrong. What it does is the part that is the same
// everywhere: payroll / 100 x rate, the overtime exclusion, the experience
// modification, schedule credits and debits, a premium discount, an expense
// constant, and the audit true-up when actual payroll differs from estimate.

const cents = (n) => Math.round(n * 100) / 100;

function num(v, name, { min = 0, max = Infinity, fallback } = {}) {
  if (v === "" || v === null || v === undefined) {
    if (fallback !== undefined) return fallback;
    throw new Error(`${name} is required`);
  }
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number`);
  if (n < min || n > max) throw new Error(`${name} must be between ${min} and ${max}`);
  return n;
}

// Only the straight-time portion of overtime wages is premium basis in most
// states: at time-and-a-half, one third of each overtime dollar is the
// premium half and is excluded. The share excluded is (m - 1) / m.
export function overtimeExclusion(overtimeWages, multiplier = 1.5) {
  const ot = num(overtimeWages, "overtime wages", { fallback: 0 });
  const m = num(multiplier, "overtime multiplier", { min: 1, max: 3, fallback: 1.5 });
  return cents((ot * (m - 1)) / m);
}

export function classPremium(row) {
  const label = String(row.label || row.code || "Class").trim() || "Class";
  const payroll = num(row.payroll, `${label} payroll`);
  const rate = num(row.rate, `${label} rate`, { max: 500 });
  const excluded = overtimeExclusion(row.overtimeWages, row.overtimeMultiplier);
  if (excluded > payroll) throw new Error(`${label}: overtime wages cannot exceed payroll`);
  const basis = cents(payroll - excluded);
  return { label, payroll, excluded, basis, rate, manual: cents((basis / 100) * rate) };
}

export function policyPremium(input) {
  const rows = (input.classes || []).filter((r) => r && (r.payroll !== "" && r.payroll !== undefined && r.payroll !== null));
  if (!rows.length) throw new Error("enter at least one class with payroll and a rate");
  const classes = rows.map(classPremium);
  const mod = num(input.mod, "experience mod", { min: 0.3, max: 3, fallback: 1 });
  const schedulePct = num(input.schedulePct, "schedule credit/debit", { min: -25, max: 25, fallback: 0 });
  const discountPct = num(input.discountPct, "premium discount", { min: 0, max: 30, fallback: 0 });
  const surchargePct = num(input.surchargePct, "surcharges", { min: 0, max: 100, fallback: 0 });
  const expenseConstant = num(input.expenseConstant, "expense constant", { fallback: 0 });
  const flatFees = num(input.flatFees, "flat fees", { fallback: 0 });

  const manual = cents(classes.reduce((s, c) => s + c.manual, 0));
  const modified = cents(manual * mod);
  const scheduled = cents(modified * (1 + schedulePct / 100));
  const discount = cents(scheduled * (discountPct / 100));
  const afterDiscount = cents(scheduled - discount);
  const surcharges = cents(afterDiscount * (surchargePct / 100));
  const total = cents(afterDiscount + surcharges + expenseConstant + flatFees);
  const payroll = cents(classes.reduce((s, c) => s + c.payroll, 0));
  const basis = cents(classes.reduce((s, c) => s + c.basis, 0));
  return {
    classes, mod, schedulePct, discountPct, surchargePct, expenseConstant, flatFees,
    manual, modified, scheduled, discount, afterDiscount, surcharges, total,
    payroll, basis,
    effectiveRate: basis > 0 ? cents((total / basis) * 100) : 0,
  };
}

// What moving the experience mod is worth, holding everything else fixed.
export function modSensitivity(input, step = 0.1) {
  const base = policyPremium(input);
  const up = policyPremium({ ...input, mod: Math.min(3, base.mod + step) });
  const down = policyPremium({ ...input, mod: Math.max(0.3, base.mod - step) });
  return {
    per001: cents((up.total - base.total) / (step * 100 || 1)),
    up: cents(up.total - base.total),
    down: cents(base.total - down.total),
    step,
  };
}

// Final-audit true-up: the carrier recomputes premium on actual payroll.
// `estimated` and `actual` are the same shape as policyPremium's input; rates
// and modifiers come from `estimated` unless `actual` overrides them.
export function auditTrueUp(estimated, actualClasses) {
  const est = policyPremium(estimated);
  const act = policyPremium({ ...estimated, classes: actualClasses });
  const diff = cents(act.total - est.total);
  return {
    estimated: est,
    actual: act,
    diff,
    direction: diff > 0 ? "additional" : diff < 0 ? "return" : "none",
    payrollDiff: cents(act.payroll - est.payroll),
  };
}

// Premium cost of putting the same basis into a different class.
export function reclassImpact(basis, fromRate, toRate, mod = 1) {
  const b = num(basis, "payroll");
  const a = num(fromRate, "current rate", { max: 500 });
  const c = num(toRate, "other rate", { max: 500 });
  const m = num(mod, "experience mod", { min: 0.3, max: 3, fallback: 1 });
  return cents((b / 100) * (c - a) * m);
}

// Plain-language findings; every number traces to the policy result.
export function findings(res) {
  const out = [];
  const money = (n) => "$" + Math.round(n).toLocaleString("en-US");
  const top = [...res.classes].sort((a, b) => b.manual - a.manual)[0];
  if (top && res.manual > 0 && top.manual / res.manual >= 0.6 && res.classes.length > 1) {
    out.push({ severity: "info", title: `${top.label} drives ${Math.round((top.manual / res.manual) * 100)}% of manual premium`,
      detail: `A misclassification in this one class moves the whole bill. Each 1.00 of rate on ${money(top.basis)} of payroll is ${money(top.basis / 100)} of manual premium before the mod.` });
  }
  if (res.mod > 1) {
    out.push({ severity: "high", title: `Your experience mod adds ${money(res.modified - res.manual)} to the policy`,
      detail: `A mod of ${res.mod.toFixed(2)} charges ${Math.round((res.mod - 1) * 100)}% above manual premium. Claims in the experience window drive it; check the worksheet for errors and ask whether open claims can be closed or reserves reduced.` });
  } else if (res.mod < 1) {
    out.push({ severity: "info", title: `Your experience mod saves ${money(res.manual - res.modified)}`,
      detail: `A mod of ${res.mod.toFixed(2)} credits you ${Math.round((1 - res.mod) * 100)}% against manual premium. It is worth protecting with a safety program and quick claim reporting.` });
  }
  if (res.schedulePct > 0) {
    out.push({ severity: "medium", title: `A ${res.schedulePct}% schedule debit adds ${money(res.scheduled - res.modified)}`,
      detail: "Schedule debits are the carrier's discretionary surcharge. They are negotiable at renewal and worth asking about, especially after a clean year." });
  }
  const fixed = res.expenseConstant + res.flatFees;
  if (fixed > 0 && res.total > 0 && fixed / res.total > 0.15) {
    out.push({ severity: "info", title: `Flat charges are ${Math.round((fixed / res.total) * 100)}% of the bill`,
      detail: "At this size a large share of the premium is fixed per policy, so shopping carriers on the rate alone will not move the total much." });
  }
  const overtime = res.classes.reduce((s, c) => s + c.excluded, 0);
  if (overtime > 0) {
    out.push({ severity: "info", title: `${money(overtime)} of overtime premium pay is excluded from the basis`,
      detail: "Confirm your payroll records separate overtime premium pay, because the auditor will only exclude what the books show." });
  }
  return out;
}
