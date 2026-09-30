// Sales commission plan comparison. Pure arithmetic, no I/O, no imports.
//
// A plan is: base salary, variable pay at 100% of quota ("target variable"),
// a threshold (minimum attainment before any commission is paid), an
// accelerator (multiple applied to the commission rate above 100%), an
// optional cap (multiple of target variable), a signing bonus and the number
// of ramp months in which target variable is guaranteed.
//
// Commission at attainment a (1 = 100% of quota), before the cap:
//   0                                   if a < threshold
//   target * (min(a,1) + accel * max(0, a-1))   otherwise
// Attainment is a share of quota, so quota itself never enters the maths.

export const money = (v) => (v == null || !Number.isFinite(v) ? "n/a" : (v < 0 ? "-" : "") + "$" + Math.round(Math.abs(v)).toLocaleString("en-US"));
export const pct = (v) => (v == null || !Number.isFinite(v) ? "n/a" : Math.round(v * 100) + "%");

const num = (v, d = 0) => {
  if (v === "" || v == null) return d;
  const n = Number(String(v).replace(/[$,%\s]/g, "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

export function normalizePlan(raw, label = "Plan") {
  const p = {
    name: String(raw.name || label).trim() || label,
    base: num(raw.base),
    target: num(raw.target),
    threshold: num(raw.threshold) / 100,
    accel: raw.accel === "" || raw.accel == null ? 1 : num(raw.accel),
    cap: num(raw.cap),
    signing: num(raw.signing),
    ramp: num(raw.ramp),
  };
  const errs = [];
  if (!(p.base >= 0)) errs.push(`${p.name}: base salary must be zero or more.`);
  if (!(p.target >= 0)) errs.push(`${p.name}: target variable must be zero or more.`);
  if (!(p.base + p.target > 0)) errs.push(`${p.name}: enter a base salary or a target variable.`);
  if (!(p.threshold >= 0 && p.threshold <= 1.5)) errs.push(`${p.name}: threshold must be between 0% and 150% of quota.`);
  if (!(p.accel >= 0 && p.accel <= 10)) errs.push(`${p.name}: accelerator must be a multiple between 0 and 10 (1 means no accelerator).`);
  if (!(p.cap >= 0)) errs.push(`${p.name}: cap must be zero (no cap) or a multiple of target variable such as 2.`);
  if (p.cap > 0 && p.cap < 1) errs.push(`${p.name}: a cap below 1x target variable would cap pay below target; enter 0 for no cap.`);
  if (!(p.signing >= 0)) errs.push(`${p.name}: signing bonus must be zero or more.`);
  if (!(p.ramp >= 0 && p.ramp <= 12)) errs.push(`${p.name}: ramp months must be between 0 and 12.`);
  return { plan: p, errs };
}

// Commission earned in a steady-state year at attainment `a`.
export function commission(plan, a) {
  if (!(a >= 0) || a < plan.threshold) return 0;
  let c = plan.target * (Math.min(a, 1) + plan.accel * Math.max(0, a - 1));
  if (plan.cap > 0) c = Math.min(c, plan.cap * plan.target);
  return c;
}

// First-twelve-months pay: ramp months pay target variable regardless of
// attainment, the remaining months pay commission at attainment `a`.
export function firstYearPay(plan, a) {
  const r = plan.ramp / 12;
  return plan.base + plan.signing + plan.target * r + commission(plan, a) * (1 - r);
}

export function steadyPay(plan, a) {
  return plan.base + commission(plan, a);
}

// Attainment at which the cap starts to bind, or null.
export function capAttainment(plan) {
  if (!(plan.cap > 0) || plan.target <= 0) return null;
  if (plan.accel > 0) {
    if (plan.cap <= 1) return plan.cap;
    return 1 + (plan.cap - 1) / plan.accel;
  }
  return plan.cap <= 1 ? plan.cap : null;
}

const GRID = Array.from({ length: 201 }, (_, i) => i / 100); // 0%..200% in 1% steps

// Every attainment where the sign of (A - B) changes, linearly interpolated
// inside the 1% step. A threshold makes pay jump, so more than one crossing
// is normal. Returns [] when the plans never cross.
export function crossovers(a, b, fn) {
  const out = [];
  let prev = fn(a, 0) - fn(b, 0);
  for (let i = 1; i < GRID.length; i++) {
    const cur = fn(a, GRID[i]) - fn(b, GRID[i]);
    if (prev !== 0 && cur !== 0 && Math.sign(prev) !== Math.sign(cur)) out.push(GRID[i - 1] + (0.01 * Math.abs(prev)) / (Math.abs(prev) + Math.abs(cur)));
    else if (prev !== 0 && cur === 0) out.push(GRID[i]);
    if (cur !== 0) prev = cur;
  }
  // A tie at an exact grid point is also seen as a sign change one step later.
  return out.filter((x, i) => i === 0 || x - out[i - 1] > 0.011);
}

export function analyze(rawA, rawB, expectedPct, basis = "steady") {
  const A = normalizePlan(rawA, "Plan A"), B = normalizePlan(rawB, "Plan B");
  const errs = [...A.errs, ...B.errs];
  const exp = expectedPct === "" || expectedPct == null ? 0.7 : num(expectedPct) / 100;
  if (!(exp >= 0 && exp <= 3)) errs.push("Expected attainment must be between 0% and 300% of quota.");
  if (errs.length) return { error: errs.join(" ") };
  const a = A.plan, b = B.plan;
  const fn = basis === "first" ? firstYearPay : steadyPay;
  const rows = [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].map((x) => ({ attainment: x, a: fn(a, x), b: fn(b, x) }));
  const at = { a: fn(a, exp), b: fn(b, exp) };
  const ote = { a: fn(a, 1), b: fn(b, 1) };
  const cross = crossovers(a, b, fn);
  const findings = [];
  const diffExp = at.a - at.b;
  const leader = diffExp === 0 ? null : diffExp > 0 ? a : b;
  const oteLeader = ote.a === ote.b ? null : ote.a > ote.b ? a : b;
  if (leader && oteLeader && leader !== oteLeader) {
    findings.push({ severity: "medium", title: "The higher headline offer is not the higher expected pay", detail: `${oteLeader.name} pays more at 100% of quota (${money(Math.max(ote.a, ote.b))} vs ${money(Math.min(ote.a, ote.b))}), but at your expected ${pct(exp)} attainment ${leader.name} pays ${money(Math.abs(diffExp))} more. On-target earnings assume you hit quota; the plan that wins at 100% is not always the plan that wins where reps actually land.` });
  } else if (leader) {
    findings.push({ severity: "info", title: `${leader.name} pays more at your expected attainment`, detail: `At ${pct(exp)} of quota ${leader.name} pays ${money(Math.abs(diffExp))} more per year (${money(Math.max(at.a, at.b))} vs ${money(Math.min(at.a, at.b))}).` });
  } else {
    findings.push({ severity: "info", title: "The plans pay the same at your expected attainment", detail: `Both pay ${money(at.a)} at ${pct(exp)} of quota; compare risk, territory and quota size instead.` });
  }
  if (cross.length) findings.push({ severity: "info", title: `The plans cross at about ${cross.map(pct).join(", ")} of quota`, detail: `The plan that pays more changes at ${cross.map(pct).join(", ")} attainment. Decide which side of each you expect to land on, and ask the employer what share of reps finished above it last year.` });
  else findings.push({ severity: "info", title: "One plan pays at least as much at every attainment from 0% to 200%", detail: "The curves never cross in this range, so the comparison does not depend on how you perform." });
  for (const p of [a, b]) {
    if (p.threshold > 0) findings.push({ severity: "medium", title: `${p.name} pays no commission below ${pct(p.threshold)} of quota`, detail: `Under the threshold you earn base salary only (${money(p.base)}). Ask whether the threshold applies per month, quarter or year, because a monthly threshold can zero out a good year.` });
    const c = capAttainment(p);
    if (c != null) findings.push({ severity: "medium", title: `${p.name} stops paying extra at about ${pct(c)} of quota`, detail: `Commission is capped at ${p.cap}x target variable (${money(p.cap * p.target)}). Above ${pct(c)} attainment extra bookings earn nothing, which matters most for a territory that could over-deliver.` });
    if (p.accel > 1 && !(p.cap > 0)) findings.push({ severity: "info", title: `${p.name} has uncapped accelerators`, detail: `Above 100% of quota each extra point pays ${p.accel}x the normal rate with no ceiling; one large deal can move total pay a long way.` });
    if (p.accel < 1) findings.push({ severity: "medium", title: `${p.name} pays less per dollar above quota than below it`, detail: `The rate above 100% is ${p.accel}x the base rate, a decelerator. Confirm this is what the plan document says.` });
    if (p.ramp > 0) findings.push({ severity: "info", title: `${p.name} guarantees target variable for ${p.ramp} ramp month${p.ramp === 1 ? "" : "s"}`, detail: basis === "first" ? "This view counts the guarantee inside first-year pay." : "This view is steady-state pay, so the guarantee is not counted; switch to first-year pay to include it." });
  }
  const baseShare = (p) => (p.base + p.target > 0 ? p.base / (p.base + p.target) : 0);
  findings.push({ severity: "info", title: "Guaranteed share of on-target pay", detail: `${a.name}: ${pct(baseShare(a))} base. ${b.name}: ${pct(baseShare(b))} base. A higher base share means lower swings but usually a lower ceiling.` });
  return { a, b, expected: exp, basis, rows, at, ote, crossover: cross, findings };
}

export function reportCsv(r) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = [["attainment_of_quota", q(r.a.name), q(r.b.name), "difference_a_minus_b"].join(",")];
  for (const x of r.rows) lines.push([Math.round(x.attainment * 100) + "%", Math.round(x.a), Math.round(x.b), Math.round(x.a - x.b)].join(","));
  lines.push(["expected_" + Math.round(r.expected * 100) + "%", Math.round(r.at.a), Math.round(r.at.b), Math.round(r.at.a - r.at.b)].join(","));
  return lines.join("\n") + "\n";
}

export const samplePlans = () => ({
  a: { name: "Offer A", base: 90000, target: 90000, threshold: 0, accel: 1, cap: 0, signing: 0, ramp: 0 },
  b: { name: "Offer B", base: 120000, target: 60000, threshold: 50, accel: 1, cap: 2, signing: 10000, ramp: 3 },
});
