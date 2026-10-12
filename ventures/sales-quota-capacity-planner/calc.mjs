// Sales quota capacity planner: pure, deterministic, no I/O.
//
// Model (all of it is stated on the page, so the numbers can be checked by hand):
//   * The plan covers 12 months starting at `planStart` (YYYY-MM).
//   * A rep in tenure month k (k = 1 is the start month) produces ramp(k) of a
//     fully ramped rep. Linear: min(1, k / rampMonths). Cliff: 0 until the ramp
//     is over, then 100%.
//   * A fully ramped rep books quota / 12 * effectiveAttainment each month.
//   * Attrition is an expected-value rate: each month a cohort keeps
//     (1 - attrition) of its reps. Existing reps start losing people in the
//     first plan month; a hire is not exposed until the month after it starts.
//   * A hire opened today cannot start before `hiringLeadTimeMonths` from the
//     plan start, so that is the earliest start the plan can offer.

export const HORIZON = 12;

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function monthIndex(ym) {
  const m = MONTH_RE.exec(String(ym ?? '').trim());
  if (!m) throw new Error(`"${ym}" is not a month in YYYY-MM form.`);
  return Number(m[1]) * 12 + Number(m[2]) - 1;
}

export function monthLabel(index) {
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

function num(label, value, { min = 0, max = Infinity, integer = false, exclusiveMin = false } = {}) {
  if (value === '' || value === null || value === undefined) throw new Error(`${label} is required.`);
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(n)) throw new Error(`${label} must be a number.`);
  if (exclusiveMin ? n <= min : n < min) throw new Error(`${label} must be ${exclusiveMin ? 'greater than' : 'at least'} ${min}.`);
  if (n > max) throw new Error(`${label} must be at most ${max}.`);
  if (integer && !Number.isInteger(n)) throw new Error(`${label} must be a whole number.`);
  return n;
}

// "3, 2025-03" / "3 @ 2025-03" / "3 2025-03", one cohort per line.
export function parseRepRoster(text) {
  const out = [];
  String(text ?? '').split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const m = /^(\d+)\s*(?:@|,|\s)\s*(\d{4}-\d{2})$/.exec(line);
    if (!m) throw new Error(`Existing reps, line ${i + 1}: use "count, YYYY-MM" such as "3, 2025-03".`);
    monthIndex(m[2]);
    out.push({ count: Number(m[1]), start: m[2] });
  });
  return out;
}

export function normalizeInputs(raw) {
  const r = raw || {};
  const roster = Array.isArray(r.existingReps) ? r.existingReps : parseRepRoster(r.existingReps);
  const existingReps = roster.map((c, i) => ({
    count: num(`Existing reps, cohort ${i + 1} count`, c.count, { integer: true }),
    startIndex: monthIndex(c.start),
    start: String(c.start).trim(),
  }));
  const curve = r.rampCurve === undefined || r.rampCurve === '' ? 'linear' : r.rampCurve;
  if (curve !== 'linear' && curve !== 'cliff') throw new Error('Ramp curve must be "linear" or "cliff".');
  return {
    planStart: String(r.planStart ?? '').trim(),
    planStartIndex: monthIndex(r.planStart),
    targetBookings: num('Annual new-bookings target', r.targetBookings, { min: 0, exclusiveMin: true }),
    quota: num('Per-rep annual quota', r.quota, { min: 0, exclusiveMin: true }),
    rampMonths: num('Ramp months', r.rampMonths, { max: 36, integer: true }),
    rampCurve: curve,
    pctAtOrOverQuota: num('Reps at or over quota (%)', r.pctAtOrOverQuota, { max: 100 }),
    avgAttainmentOfRest: num('Average attainment of the rest (%)', r.avgAttainmentOfRest, { max: 100 }),
    overachieverAttainment: num('Average attainment of reps at or over quota (%)', r.overachieverAttainment ?? 100, { min: 100, max: 300 }),
    monthlyAttritionPct: num('Monthly attrition (%)', r.monthlyAttritionPct, { max: 50 }),
    hiringLeadTimeMonths: num('Hiring lead time (months)', r.hiringLeadTimeMonths, { max: 24, integer: true }),
    existingReps,
    pipelineCoverage: num('Pipeline coverage (x of target)', r.pipelineCoverage, { max: 100 }),
    winRatePct: num('Pipeline win rate (%)', r.winRatePct, { min: 0, max: 100, exclusiveMin: true }),
    fullyLoadedAnnualCost: num('Fully loaded annual cost per rep', r.fullyLoadedAnnualCost, { min: 0 }),
  };
}

export function effectiveAttainment(n) {
  const p = n.pctAtOrOverQuota / 100;
  return p * n.overachieverAttainment + (1 - p) * n.avgAttainmentOfRest;
}

export function rampFactor(k, rampMonths, curve = 'linear') {
  if (k <= 0) return 0;
  if (rampMonths <= 0) return 1;
  if (curve === 'cliff') return k > rampMonths ? 1 : 0;
  return Math.min(1, k / rampMonths);
}

// Productive reps and headcount for one cohort in plan month t (0-based).
function cohortInMonth(cohort, t, n, attr) {
  const startRel = cohort.startIndex - n.planStartIndex;
  const k = t - startRel + 1;
  if (k <= 0) return { heads: 0, rre: 0 };
  const exposure = Math.max(0, t - Math.max(startRel, 0));
  const heads = cohort.count * Math.pow(1 - attr, exposure);
  return { heads, rre: heads * rampFactor(k, n.rampMonths, n.rampCurve) };
}

function project(n, hires, { attainmentDelta = 0, attritionMult = 1, attainmentScale = 1 } = {}) {
  const attr = Math.min(1, (n.monthlyAttritionPct / 100) * attritionMult);
  const eff = Math.max(0, effectiveAttainment(n) * attainmentScale + attainmentDelta);
  const perRepMonth = (n.quota / 12) * (eff / 100);
  const cohorts = [
    ...n.existingReps.map((c) => ({ startIndex: c.startIndex, count: c.count })),
    ...hires.map((h) => ({ startIndex: n.planStartIndex + h.startMonth, count: h.count })),
  ];
  const months = [];
  let cum = 0;
  for (let t = 0; t < HORIZON; t++) {
    let heads = 0;
    let rre = 0;
    for (const c of cohorts) {
      const x = cohortInMonth(c, t, n, attr);
      heads += x.heads;
      rre += x.rre;
    }
    const bookings = rre * perRepMonth;
    cum += bookings;
    const monthlyTarget = n.targetBookings / HORIZON;
    months.push({
      month: monthLabel(n.planStartIndex + t),
      headcount: heads,
      rampedRepEquivalents: rre,
      bookings,
      cumulativeBookings: cum,
      cumulativeTarget: monthlyTarget * (t + 1),
      cumulativeGap: monthlyTarget * (t + 1) - cum,
    });
  }
  return { months, total: cum, effectiveAttainmentPct: eff };
}

// Expected bookings from one hire who starts in plan month h, under n.
function perHireBookings(n, h, opts) {
  return project({ ...n, existingReps: [] }, [{ startMonth: h, count: 1 }], opts).total;
}

function hireCost(n, startMonth, attritionMult = 1) {
  const attr = Math.min(1, (n.monthlyAttritionPct / 100) * attritionMult);
  let months = 0;
  for (let t = startMonth; t < HORIZON; t++) months += Math.pow(1 - attr, t - startMonth);
  return (n.fullyLoadedAnnualCost / 12) * months;
}

// Fewest hires, all starting at the earliest possible month, that reach the target.
function hiresNeededAtEarliest(n, opts) {
  const base = project(n, [], opts).total;
  const gap = n.targetBookings - base;
  if (gap <= 1e-9) return { hires: 0, base, gap, earliest: n.hiringLeadTimeMonths, feasible: true, perHire: null };
  const e = n.hiringLeadTimeMonths;
  if (e >= HORIZON) return { hires: null, base, gap, earliest: e, feasible: false, perHire: 0 };
  const perHire = perHireBookings(n, e, opts);
  if (perHire <= 1e-9) return { hires: null, base, gap, earliest: e, feasible: false, perHire };
  return { hires: Math.ceil(gap / perHire - 1e-9), base, gap, earliest: e, feasible: true, perHire };
}

// Sequentially delay each hire as far as the target still holds, given the
// hires already placed and the rest at the earliest start.
function latestSchedule(n, count, earliest) {
  const base = project(n, [], {}).total;
  const contrib = [];
  for (let h = 0; h < HORIZON; h++) contrib[h] = perHireBookings(n, h, {});
  const starts = new Array(count).fill(earliest);
  const total = () => base + starts.reduce((s, h) => s + contrib[h], 0);
  for (let i = 0; i < count; i++) {
    for (let h = HORIZON - 1; h >= earliest; h--) {
      starts[i] = h;
      if (total() >= n.targetBookings - 1e-6) break;
    }
  }
  return starts.slice().sort((a, b) => a - b);
}

function toCohorts(n, starts) {
  const byMonth = new Map();
  for (const h of starts) byMonth.set(h, (byMonth.get(h) || 0) + 1);
  return [...byMonth.entries()].sort((a, b) => a[0] - b[0]).map(([h, count]) => ({
    startMonth: h,
    startDate: monthLabel(n.planStartIndex + h),
    count,
    openRequisitionBy: monthLabel(n.planStartIndex + h - n.hiringLeadTimeMonths),
    requisitionOffsetMonths: h - n.hiringLeadTimeMonths,
  }));
}

export const ATTAINMENT_DELTAS = [-10, -5, 0, 5, 10];
export const ATTRITION_MULTIPLIERS = [0.5, 1, 1.5, 2];

export function planCapacity(raw) {
  const n = normalizeInputs(raw);
  const eff = effectiveAttainment(n);
  const annualPerRep = n.quota * (eff / 100);
  const baseline = project(n, []);
  const need = hiresNeededAtEarliest(n, {});

  const pipelineCeiling = n.pipelineCoverage * n.targetBookings * (n.winRatePct / 100);
  const requiredCoverage = 100 / n.winRatePct;

  let hires = [];
  let withPlan = baseline;
  let early = null;
  let late = null;
  let cohorts = [];
  if (need.feasible && need.hires > 0) {
    const lateStarts = latestSchedule(n, need.hires, need.earliest);
    const earlyStarts = new Array(need.hires).fill(need.earliest);
    const asHires = (starts) => toCohorts(n, starts).map((c) => ({ startMonth: c.startMonth, count: c.count }));
    cohorts = toCohorts(n, lateStarts);
    hires = asHires(lateStarts);
    withPlan = project(n, hires);
    const earlyProj = project(n, asHires(earlyStarts));
    const down = { attainmentScale: 0.9 };
    const sum = (starts, mult = 1) => starts.reduce((s, h) => s + hireCost(n, h, mult), 0);
    early = {
      starts: earlyStarts.map((h) => monthLabel(n.planStartIndex + h)),
      bookings: earlyProj.total,
      cost: sum(earlyStarts),
      bookingsAtLowerAttainment: project(n, asHires(earlyStarts), down).total,
    };
    late = {
      starts: lateStarts.map((h) => monthLabel(n.planStartIndex + h)),
      bookings: withPlan.total,
      cost: sum(lateStarts),
      bookingsAtLowerAttainment: project(n, hires, down).total,
    };
    early.shortfallAtLowerAttainment = Math.max(0, n.targetBookings - early.bookingsAtLowerAttainment);
    late.shortfallAtLowerAttainment = Math.max(0, n.targetBookings - late.bookingsAtLowerAttainment);
  }
  const compare = early && late ? {
    early,
    late,
    extraBookingsFromEarly: early.bookings - late.bookings,
    extraCostOfEarly: early.cost - late.cost,
    costPerExtraBookingDollar: early.bookings - late.bookings > 1e-6 ? (early.cost - late.cost) / (early.bookings - late.bookings) : null,
    downsideAttainmentCutPct: 10,
  } : null;

  // Sensitivity: how many hires (at the earliest start) the target needs, and
  // what the chosen hire plan books, if attainment or attrition differ.
  const sensitivity = [];
  for (const d of ATTAINMENT_DELTAS) {
    for (const m of ATTRITION_MULTIPLIERS) {
      const opts = { attainmentDelta: d, attritionMult: m };
      const nd = hiresNeededAtEarliest(n, opts);
      const planBookings = project(n, hires, opts).total;
      sensitivity.push({
        attainmentDeltaPoints: d,
        attritionMultiplier: m,
        monthlyAttritionPct: n.monthlyAttritionPct * m,
        attainmentPct: Math.max(0, eff + d),
        hiresNeeded: nd.hires,
        planBookings,
        planGap: n.targetBookings - planBookings,
      });
    }
  }

  return {
    inputs: n,
    effectiveAttainmentPct: eff,
    expectedBookingsPerRampedRep: annualPerRep,
    steadyStateRepsNeeded: n.targetBookings / annualPerRep,
    months: withPlan.months,
    baselineMonths: baseline.months,
    baselineBookings: baseline.total,
    baselineGap: n.targetBookings - baseline.total,
    plannedBookings: withPlan.total,
    gapVsTarget: n.targetBookings - withPlan.total,
    hiresNeeded: need.hires,
    feasible: need.feasible,
    earliestStart: monthLabel(n.planStartIndex + need.earliest),
    cohorts,
    compare,
    pipeline: {
      coverage: n.pipelineCoverage,
      requiredCoverage,
      winRatePct: n.winRatePct,
      ceiling: pipelineCeiling,
      limited: pipelineCeiling < n.targetBookings,
      gap: Math.max(0, n.targetBookings - pipelineCeiling),
    },
    sensitivity,
    notes: notesFor(n, need),
  };
}

function notesFor(n, need) {
  const notes = [];
  if (!need.feasible) {
    notes.push(`A hire opened today cannot start before ${monthLabel(n.planStartIndex + n.hiringLeadTimeMonths)}, and a rep starting then produces nothing measurable inside this 12-month plan. Hiring cannot close the gap in this window: lower the target, shorten the lead time, or count the gap as next year's capacity.`);
  }
  return notes;
}

const csvCell = (v) => {
  const s = typeof v === 'number' ? String(Math.round(v * 100) / 100) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

export function toCsv(result) {
  const rows = [['month', 'headcount', 'ramped_rep_equivalents', 'expected_bookings', 'cumulative_bookings', 'cumulative_target', 'cumulative_gap']];
  for (const m of result.months) {
    rows.push([m.month, m.headcount, m.rampedRepEquivalents, m.bookings, m.cumulativeBookings, m.cumulativeTarget, m.cumulativeGap]);
  }
  rows.push([]);
  rows.push(['hire_cohort_start', 'hires', 'open_requisition_by']);
  for (const c of result.cohorts) rows.push([c.startDate, c.count, c.openRequisitionBy]);
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

// Shareable URL state. Keys are short and carry only the typed inputs.
const STATE_KEYS = ['planStart', 'targetBookings', 'quota', 'rampMonths', 'rampCurve', 'pctAtOrOverQuota', 'avgAttainmentOfRest', 'overachieverAttainment', 'monthlyAttritionPct', 'hiringLeadTimeMonths', 'pipelineCoverage', 'winRatePct', 'fullyLoadedAnnualCost'];

export function encodeState(values) {
  const p = new URLSearchParams();
  for (const k of STATE_KEYS) if (values[k] !== undefined && values[k] !== '') p.set(k, String(values[k]));
  const reps = typeof values.existingReps === 'string' ? values.existingReps : '';
  const compact = reps.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).join(';');
  if (compact) p.set('existingReps', compact);
  return p.toString();
}

export function decodeState(search) {
  const p = new URLSearchParams(String(search || '').replace(/^\?/, ''));
  const out = {};
  for (const k of STATE_KEYS) if (p.has(k)) out[k] = p.get(k);
  if (p.has('existingReps')) out.existingReps = p.get('existingReps').split(';').join('\n');
  return out;
}
