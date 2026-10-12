// Workers' compensation final-audit dispute checker.
//
// A carrier's premium audit re-prices the policy on audited payroll. The usual dollar errors are not in the rate: they are payroll the
// policy does not charge for (overtime premium pay, subcontractors with their own coverage, an officer outside the min/max payroll
// band) or payroll booked to a costlier class. The user types the figures from the audit worksheet and from their own books; this
// module ships no rate or class-code table and decides nothing about who is right. It prices the gap and names the record that would
// prove each line.

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
const label = (r, d) => String(r.label || r.name || d).trim() || d;
const blank = (r) => !r || ["payroll", "audited", "amount", "auditedPayroll"].every((k) => r[k] === "" || r[k] === undefined || r[k] === null);

// Share of an overtime dollar that is premium pay (excluded from basis in most states): (m - 1) / m.
export function overtimeExcluded(wages, multiplier = 1.5) {
  const w = num(wages, "overtime wages", { fallback: 0 });
  const m = num(multiplier, "overtime multiplier", { min: 1, max: 3, fallback: 1.5 });
  return cents((w * (m - 1)) / m);
}

// Carrier's modifiers applied to a dollar of manual premium, in the order the premium is built.
export function loadFactor(m = {}) {
  const mod = num(m.mod, "experience mod", { min: 0.3, max: 3, fallback: 1 });
  const sched = num(m.schedulePct, "schedule credit/debit", { min: -25, max: 25, fallback: 0 });
  const disc = num(m.discountPct, "premium discount", { min: 0, max: 30, fallback: 0 });
  const sur = num(m.surchargePct, "surcharges", { min: 0, max: 100, fallback: 0 });
  return mod * (1 + sched / 100) * (1 - disc / 100) * (1 + sur / 100);
}

const EVIDENCE = {
  overtime: "Payroll register or timecards showing overtime premium pay on its own line, for the audit period.",
  sub: "The subcontractor's certificate of insurance for workers' compensation, in force for the days they worked for you, and the invoice.",
  officer: "The policy's officer inclusion/exclusion endorsement and the state's minimum and maximum executive payroll for the policy year.",
  reclass: "Job records, timesheets or a written description of duties showing the work done in each class during the term.",
  payroll: "Quarterly payroll tax filings and the general ledger payroll accounts for the audit period.",
};

export function auditDispute(input) {
  const factor = loadFactor(input);
  const items = [];

  for (const r of (input.classes || []).filter((x) => !blank(x))) {
    const name = label(r, "Class");
    const aPay = num(r.auditedPayroll, `${name} audited payroll`);
    const rate = num(r.rate, `${name} rate`, { max: 500 });
    const aOt = overtimeExcluded(r.auditedOvertime, r.overtimeMultiplier);
    if (aOt > aPay) throw new Error(`${name}: audited overtime cannot exceed audited payroll`);
    const blankv = (v) => v === "" || v === undefined || v === null;
    const ownPay = blankv(r.ownPayroll) ? aPay : num(r.ownPayroll, `${name} payroll in your records`);
    const ownOt = overtimeExcluded(blankv(r.ownOvertime) ? r.auditedOvertime : r.ownOvertime, r.overtimeMultiplier);
    if (ownOt > ownPay) throw new Error(`${name}: overtime cannot exceed payroll`);
    const ownBasis = cents(ownPay - ownOt);
    const moveTo = r.moveToRate === "" || r.moveToRate === undefined || r.moveToRate === null ? null : num(r.moveToRate, `${name} other-class rate`, { max: 500 });
    const moveAmt = moveTo === null ? 0 : num(r.moveAmount, `${name} payroll that belongs in the other class`, { max: ownBasis });
    const moveRate = moveTo ?? rate;
    // The basis gap is (audit payroll - your payroll) + (your excluded overtime - audit excluded overtime); price each cause alone.
    const otCause = cents(((ownOt - aOt) / 100) * rate * factor);
    const payCause = cents(((aPay - ownPay) / 100) * rate * factor);
    const reclass = cents((moveAmt / 100) * (moveRate - rate) * factor);
    const claim = (kind, dollars, title, detail) => { if (Math.abs(dollars) >= 0.005) items.push({ kind, scope: name, dollars: cents(dollars), title, detail, evidence: EVIDENCE[kind] }); };
    claim("overtime", -otCause, `${name}: overtime premium pay excluded`, `The audit excludes ${money(aOt)} of overtime premium pay; your books exclude ${money(ownOt)}. At the ${rate} rate that is ${money(Math.abs(otCause))} after the mod and other loads.`);
    claim("payroll", -payCause, `${name}: audited payroll differs from your records`, `Audit ${money(aPay)} against ${money(ownPay)} in your records.`);
    claim("reclass", reclass, `${name}: ${money(moveAmt)} belongs in a class rated ${moveRate}`, `Moving that payroll from rate ${rate} to rate ${moveRate} changes the premium by ${money(Math.abs(reclass))}. Only raise this if your records support the other class; it can go either way.`);
  }

  for (const s of (input.subs || []).filter((x) => !blank(x))) {
    const name = label(s, "Subcontractor");
    const amt = num(s.amount, `${name} amount charged`);
    const rate = num(s.rate, `${name} rate`, { max: 500 });
    const certified = s.certificate === true || s.certificate === "yes" || s.certificate === "true";
    const dollars = cents((amt / 100) * rate * factor);
    if (certified) {
      items.push({ kind: "sub", scope: name, dollars: -dollars, title: `${name}: remove ${money(amt)} charged as uninsured`,
        detail: `You hold a workers' comp certificate for this subcontractor, so the audit should not have charged you ${money(dollars)} for their payroll.`, evidence: EVIDENCE.sub });
    } else {
      items.push({ kind: "info", scope: name, dollars: 0, title: `${name}: no certificate recorded`,
        detail: `Without a certificate in force for the work period the carrier can charge ${money(dollars)} for this line. Ask the subcontractor for a certificate dated to cover the job, then re-check; a certificate issued after the audit may not be accepted.`, evidence: EVIDENCE.sub });
    }
  }

  for (const o of (input.officers || []).filter((x) => !blank(x))) {
    const name = label(o, "Officer");
    const aPay = num(o.auditedPayroll, `${name} audited payroll`);
    const min = num(o.minPayroll, `${name} minimum payroll`, { fallback: 0 });
    const max = num(o.maxPayroll, `${name} maximum payroll`, { fallback: Infinity });
    const rate = num(o.rate, `${name} rate`, { max: 500 });
    if (min > max) throw new Error(`${name}: minimum payroll cannot exceed maximum`);
    const allowed = Math.min(Math.max(aPay, min), max);
    const dollars = cents(((allowed - aPay) / 100) * rate * factor);
    if (dollars !== 0) items.push({ kind: "officer", scope: name, dollars, title: `${name}: payroll ${money(aPay)} is outside the ${money(min)}–${max === Infinity ? "no cap" : money(max)} band`,
      detail: `Held to ${money(allowed)}, the premium changes by ${money(Math.abs(dollars))}${dollars < 0 ? " in your favor" : " against you"}. Confirm the band for your state and policy year before you raise it.`, evidence: EVIDENCE.officer });
  }

  items.sort((a, b) => a.dollars - b.dollars || a.title.localeCompare(b.title));
  const claimable = cents(items.filter((i) => i.dollars < 0).reduce((s, i) => s - i.dollars, 0));
  const againstYou = cents(items.filter((i) => i.dollars > 0).reduce((s, i) => s + i.dollars, 0));
  const net = cents(claimable - againstYou);
  if (!items.length) throw new Error("enter at least one audited class, subcontractor or officer line");
  return { items, claimable, againstYou, net, factor: Math.round(factor * 10000) / 10000 };
}

export function money(n) {
  return "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// A plain dispute note built from the lines, for the user to edit; states figures and records, never a legal position.
export function disputeNote(res, { policy = "", period = "" } = {}) {
  const lines = [`Re: premium audit${policy ? ` for policy ${policy}` : ""}${period ? ` (${period})` : ""}`, "",
    "I am requesting review of the following audit lines. Supporting records are attached or available on request.", ""];
  res.items.filter((i) => i.dollars < 0).forEach((i, n) => lines.push(`${n + 1}. ${i.title} — about ${money(i.dollars)} premium. Records: ${i.evidence}`));
  lines.push("", `Estimated premium in question: ${money(res.claimable)}. Figures are my own calculation from the audit worksheet; please confirm against the rating rules that apply to this policy.`);
  return lines.join("\n");
}
