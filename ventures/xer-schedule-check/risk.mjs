// Schedule risk analysis: how likely is the forecast finish, and which
// activities decide it? A Monte Carlo run over the recomputed CPM network.
//
// riskAnalysis(xer, opts) -> {
//   project: { id, code, name, dataDate, finish, mustFinish },
//   iterations, seed, range: { min, likely, max }, correlation, overrides,
//   percentiles: [{ p, date, days, overDeterministic }],
//   mean: { date, days }, pDeterministic, pMustFinish,
//   histogram: [{ from, to, count }]   (working days from the data date),
//   activities: [{ code, name, criticality, sensitivity (null below noiseFloor), deterministicCritical }],
//   risks: [{ id, probability, impact, targets, occurred, finishShift, shiftNoise, ... }] (risk register),
//   withoutRisks: { percentiles, pDeterministic, pMustFinish } | null,
//   branches: [{ id, branches: [{ name, probability, codes, taken, finishShift, shiftNoise, notNoise }], none, fixed }],
//   warnings: [...],
// }
//
// Each iteration draws every open activity's remaining duration from a
// triangular distribution (min, most likely, max as multiples of the file's
// remaining duration, or per-activity working days from a CSV), recomputes
// the early dates with cpm.mjs (the same engine that matches P6 on 99.9% of
// 19,822 activities), and records the project finish and the driving path.
//
// What it gives a reviewer that the single CPM date cannot:
// - the chance of finishing by the forecast date (merge bias: where parallel
//   paths join, the later of two uncertain paths is later on average than
//   either, so the deterministic date is usually below the P50);
// - P50 / P80 finish dates and the contingency between the forecast and P80;
// - criticality index: the share of runs in which an activity is on the
//   driving path (near-critical work that the single path hides);
// - sensitivity: the correlation between an activity's sampled duration and
//   the project finish, so the activities that move the date rank first.
//
// What it cannot know: the ranges. An XER file stores one duration per
// activity, so the default range is an assumption the user should replace
// with ranges from the people who will do the work. Independent draws
// understate the spread when the same cause (weather, productivity) affects
// many activities; `correlation` (0 to 1) adds one shared factor to every
// draw (a one-factor Gaussian copula).
//
// Risk register events (`risks`): a discrete event with a probability and an
// impact range (optimistic, most likely, pessimistic working days) that, when
// it occurs in a run, adds the drawn impact to the remaining duration of each
// activity it names (one draw per event per run, so an event hitting three
// activities delays all three by the same days, each on its own calendar).
// Every run is scheduled twice with the same duration draws, once with the
// events and once without, so the gap between the two P80s is the
// contingency the register itself asks for, free of sampling noise between
// separate runs (common random numbers). Each event is ranked by its finish
// shift: the mean finish of runs where it occurred minus the mean of runs
// where it did not. Resource limits are not modelled.
//
// Probabilistic branches (`branches`): a point where the work takes one of
// several paths, each with a probability (an inspection passes, or 30% of
// the time the rework A2010 and re-test A2020 follow; a permit comes through,
// or the redesign path runs). The XER holds every path's activities in the
// network, so the single CPM date counts the work of all of them. In each run
// one branch per group is drawn; the activities of the branches not drawn are
// dropped from that run (remaining duration 0, their logic kept, so work
// after them waits only on the rest of its logic), as Primavera Risk Analysis
// and Safran Risk do with branch activities that "do not exist" in an
// iteration. Probabilities in a group may sum to under 1: the remainder is
// the case where none of the listed branches' activities happen. A group with
// work already started on one branch has taken it: that branch is kept in
// every run. Branches draw from their own random stream, so adding them
// leaves every duration and event draw as it was.
//
// Resource levelling in every run (`level`: true or level.mjs options such
// as { limitScale, withinFloat, curves }; opt-in, CLI --levelled): the
// single CPM date assumes unlimited crews, and so does a plain Monte Carlo
// over it. With `level`, each run's sampled durations (and events) are
// levelled by level.mjs against the file's resource limits before the finish
// is read, as Primavera Risk Analysis offers with "resource levelling during
// risk analysis". An assignment that spans its activity stretches with the
// drawn duration at the same rate per hour. Every run is also scheduled
// without levelling on the same draws, so `levelling.resourceDelay` (the
// levelled finish minus the unlevelled one, run by run) is the time the
// crew limits themselves cost, free of sampling noise. The driving path of a
// levelled run follows resource waits as well as logic
// (level.levelledDrivingPath), so the criticality index counts the activity
// a crew was waiting for. Levelling is slow on large files (a whole levelling
// per run, twice when a risk event occurs): the page and CLI default to fewer
// runs with it on.

import { schedule, buildModel, drivingPath } from "./cpm.mjs";
import { level, levelledDrivingPath } from "./level.mjs";

export const DEFAULT_RANGE = { min: 0.9, likely: 1, max: 1.25 };

// mulberry32: a small seeded generator, so a run can be repeated exactly
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(rand) {
  let u = 0;
  while (u === 0) u = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

// standard normal CDF (Abramowitz and Stegun 7.1.26, error < 1.5e-7)
export function phi(z) {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

// inverse CDF of the triangular distribution (a <= c <= b) at u in [0, 1)
export function triangular(u, a, c, b) {
  if (b <= a) return a;
  const f = (c - a) / (b - a);
  return u < f ? a + Math.sqrt(u * (b - a) * (c - a)) : b - Math.sqrt((1 - u) * (b - a) * (b - c));
}

// A per-activity range in minutes of work. `unit`: "days" (default) of the
// activity's own calendar, "hours", or "pct" of the remaining duration;
// `likely` null means the file's remaining duration (ranges read from P6
// UDFs that store only an optimistic and a pessimistic value).
export function toMinutes(o, t, hpd = t.cal?.hoursPerDay || 8) {
  const k = o.unit === "hours" ? 60 : o.unit === "pct" ? t.remain / 100 : hpd * 60;
  return { a: o.min * k, c: o.likely == null ? t.remain : o.likely * k, b: o.max * k };
}

// "code,min,likely,max" per line, in working days of the activity's own
// calendar; a header line and blank lines are skipped.
export function parseRanges(text) {
  const out = new Map();
  const bad = [];
  for (const [i, raw] of String(text || "").split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line) continue;
    const cells = line.split(/[,;\t]/).map((c) => c.trim().replace(/^"|"$/g, ""));
    const nums = cells.slice(1, 4).map(Number);
    if (cells.length < 4 || nums.some((n) => !Number.isFinite(n))) {
      if (i > 0) bad.push(i + 1);
      continue;
    }
    const [min, likely, max] = nums;
    if (min < 0 || min > likely || likely > max) { bad.push(i + 1); continue; }
    out.set(cells[0], { min, likely, max });
  }
  return { ranges: out, bad };
}

function pickProject(model, projId) {
  if (projId && model.projects.has(projId)) return projId;
  const counts = new Map();
  for (const t of model.tasks.values()) if (!t.span && t.status !== "TK_Complete") counts.set(t.proj, (counts.get(t.proj) || 0) + 1);
  let best = null;
  for (const [id, n] of counts) if (best === null || n > counts.get(best)) best = id;
  return best;
}

// One event per line: "ID or name, probability, optimistic, most likely,
// pessimistic, activity ID[, activity ID ...]". Probability as 0.3 or 30%;
// impacts in working days added to each named activity. A header line and
// blank lines are skipped; bad lines are returned by number.
export function parseRisks(text) {
  const risks = [];
  const bad = [];
  for (const [i, raw] of String(text || "").split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line) continue;
    const cells = line.split(/[,;\t]/).map((c) => c.trim().replace(/^"|"$/g, ""));
    const pc = (cells[1] || "").replace(/\s+/g, "");
    let prob = /%$/.test(pc) ? Number(pc.slice(0, -1)) / 100 : Number(pc);
    const nums = cells.slice(2, 5).map(Number);
    const codes = cells.slice(5).filter(Boolean);
    const ok = cells.length >= 6 && pc !== "" && Number.isFinite(prob) && nums.every((n) => Number.isFinite(n)) && codes.length && cells[0];
    if (!ok) { if (i > 0) bad.push(i + 1); continue; }
    if (prob > 1 && prob <= 100 && !/%$/.test(pc)) prob /= 100; // "30" read as 30%
    const [min, likely, max] = nums;
    if (!(prob > 0 && prob <= 1) || min < 0 || min > likely || likely > max) { bad.push(i + 1); continue; }
    risks.push({ id: cells[0], probability: prob, min, likely, max, codes });
  }
  return { risks, bad };
}

// One branch per line: "group, branch, probability[, activity ID ...]".
// Lines sharing a group are the alternatives at one point; probability as
// 0.3 or 30%. A branch may list no activity (the path that adds no work).
// A header line and blank lines are skipped; bad lines are returned by
// number, and a group whose probabilities sum above 1 by name.
export function parseBranches(text) {
  const groups = new Map();
  const bad = [];
  for (const [i, raw] of String(text || "").split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line) continue;
    const cells = line.split(/[,;\t]/).map((c) => c.trim().replace(/^"|"$/g, ""));
    const pc = (cells[2] || "").replace(/\s+/g, "");
    let prob = /%$/.test(pc) ? Number(pc.slice(0, -1)) / 100 : Number(pc);
    if (!(cells.length >= 3 && cells[0] && cells[1] && pc !== "" && Number.isFinite(prob))) { if (i > 0) bad.push(i + 1); continue; }
    if (prob > 1 && prob <= 100 && !/%$/.test(pc)) prob /= 100;
    if (!(prob > 0 && prob <= 1)) { bad.push(i + 1); continue; }
    if (!groups.has(cells[0])) groups.set(cells[0], { id: cells[0], branches: [] });
    const g = groups.get(cells[0]);
    if (g.branches.some((b) => b.name === cells[1])) { bad.push(i + 1); continue; }
    g.branches.push({ name: cells[1], probability: prob, codes: [...new Set(cells.slice(3).filter(Boolean))] });
  }
  const over = [];
  const out = [];
  for (const g of groups.values()) {
    const sum = g.branches.reduce((a, b) => a + b.probability, 0);
    if (sum > 1 + 1e-9) over.push(g.id); else out.push(g);
  }
  return { branches: out, bad, over };
}

const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))];

// A generator: yields after each run ({ done, of }), returns the result, so
// the page can run it in slices without freezing (riskAnalysisAsync).
export function* riskSteps(xer, opts = {}) {
  const iterations = Math.max(10, Math.floor(opts.iterations ?? 500));
  const seed = opts.seed ?? 1;
  const range = { ...DEFAULT_RANGE, ...(opts.range || {}) };
  if (!(range.min > 0 && range.min <= range.likely && range.likely <= range.max)) throw new Error("range must satisfy 0 < min <= likely <= max");
  const rho = Math.min(1, Math.max(0, opts.correlation ?? 0));
  const overrides = opts.ranges || new Map(); // code -> { min, likely, max } in working days
  const model = opts.model || buildModel(xer);
  const pid = pickProject(model, opts.projId);
  if (pid === null) throw new Error("the file has no open activities");
  const base = schedule(xer, { model, forwardOnly: true });
  const p0 = base.projects.get(pid);
  if (!p0 || p0.finish === null) throw new Error("the project has no forecast finish");
  const pcal = p0.cal || model.tasks.values().next().value.cal;
  const phpd = pcal.hoursPerDay || 8;
  const start = p0.dataDate ?? Math.min(...[...base.tasks.values()].map((r) => r.es));
  const dayOf = (m) => pcal.workBetween(pcal.nextStart(start), m) / 60 / phpd;
  const warnings = [];

  // the activities whose durations vary: open, in the network, with work left
  const vary = [];
  const used = new Set();
  const inconsistent = []; // ranges whose points are out of order once in minutes
  for (const t of model.tasks.values()) {
    if (t.span || t.status === "TK_Complete" || t.type === "TT_Mile" || t.type === "TT_FinMile") continue;
    const hpd = t.cal.hoursPerDay || 8;
    const o = overrides.get(t.code);
    if (o) used.add(t.code);
    const m = o ? toMinutes(o, t, hpd) : null;
    // a negative point would draw negative work (parseRanges rejects min < 0;
    // UDF ranges reach here unchecked)
    if (m && m.a >= 0 && m.a <= m.c && m.c <= m.b) {
      vary.push({ t, ...m });
    } else if (m) {
      inconsistent.push(t.code);
      if (t.remain > 0) vary.push({ t, a: t.remain * range.min, c: t.remain * range.likely, b: t.remain * range.max });
    } else if (t.remain > 0) {
      vary.push({ t, a: t.remain * range.min, c: t.remain * range.likely, b: t.remain * range.max });
    }
  }
  // risk events: resolve their activity IDs to open, non-milestone activities
  const byCode = new Map();
  for (const t of model.tasks.values()) if (!t.span && !byCode.has(t.code)) byCode.set(t.code, t);
  const events = [];
  for (const rk of opts.risks || []) {
    const targets = [], missing = [], skipped = [];
    for (const code of rk.codes) {
      const t = byCode.get(code);
      if (!t) missing.push(code);
      else if (t.status === "TK_Complete" || t.type === "TT_Mile" || t.type === "TT_FinMile") skipped.push(code);
      else if (!targets.includes(t)) targets.push(t);
    }
    if (missing.length) warnings.push(`risk ${rk.id}: no activity ${missing.join(", ")}`);
    if (skipped.length) warnings.push(`risk ${rk.id}: ${skipped.join(", ")} finished or a milestone, so it cannot take a delay`);
    if (!targets.length) { warnings.push(`risk ${rk.id} left out: it names no open activity`); continue; }
    if (targets.some((t) => t.proj !== pid)) warnings.push(`risk ${rk.id}: names activities of another project in the file; they delay this one only through links`);
    events.push({ rk, targets, hits: 0, sumHit: 0, sumMiss: 0, sumImpact: 0 });
  }
  // probabilistic branches: resolve activity IDs; a started branch is taken
  const groups = [];
  const START = (t) => t.status === "TK_Active" || t.status === "TK_Complete";
  for (const g of opts.branches || []) {
    const missing = [];
    const bs = g.branches.map((b) => {
      const tasks = [];
      for (const code of b.codes) { const t = byCode.get(code); if (!t) missing.push(code); else if (!tasks.includes(t)) tasks.push(t); }
      return { ...b, tasks, taken: 0, sumY: 0 };
    });
    if (missing.length) warnings.push(`branch group ${g.id}: no activity ${missing.join(", ")}`);
    const started = bs.filter((b) => b.tasks.some(START));
    if (started.length > 1) { warnings.push(`branch group ${g.id} left out: work has started on more than one of its branches (${started.map((b) => b.name).join(", ")})`); continue; }
    const all = new Set(bs.flatMap((b) => b.tasks));
    if (!all.size) { warnings.push(`branch group ${g.id} left out: it names no activity in the file`); continue; }
    if ([...all].some((t) => t.proj !== pid)) warnings.push(`branch group ${g.id}: names activities of another project in the file; they move this one only through links`);
    const fixed = started.length ? started[0].name : null;
    if (fixed) warnings.push(`branch group ${g.id}: work has started on branch ${fixed}, so it is taken in every run`);
    const sum = bs.reduce((a, b) => a + b.probability, 0);
    groups.push({ id: g.id, bs, all: [...all], fixed, none: Math.max(0, 1 - sum), noneTaken: 0, noneSumY: 0 });
  }
  if (groups.length) warnings.push(`${groups.length} branch group(s): the forecast finish counts the work of every branch, the runs only the branch drawn in each`);
  const unknown = [...overrides.keys()].filter((k) => !used.has(k));
  if (unknown.length) warnings.push(`${unknown.length} range line(s) name no open activity: ${unknown.slice(0, 5).join(", ")}${unknown.length > 5 ? ", ..." : ""}`);
  if (inconsistent.length) warnings.push(`${inconsistent.length} activity range(s) left on the default range because 0 <= optimistic <= most likely <= pessimistic fails (a point is negative or out of order)${overrides.size && [...overrides.values()].some((o) => o.likely == null) ? " (most likely = the file's remaining duration)" : ""}: ${inconsistent.slice(0, 5).join(", ")}${inconsistent.length > 5 ? ", ..." : ""}`);
  if (opts.rangeSource) warnings.push(opts.rangeSource);
  if (!overrides.size) warnings.push(`every open activity uses the same range (${Math.round(range.min * 100)}% / ${Math.round(range.likely * 100)}% / ${Math.round(range.max * 100)}% of its remaining duration): an assumption, not data from the file; replace it with ranges from the people doing the work`);
  const lvl = opts.level ? (opts.level === true ? {} : opts.level) : null;
  let lvl0 = null; // the levelled forecast, with the file's durations
  if (lvl) {
    lvl0 = level(xer, { ...lvl, model, projId: pid });
    if (!lvl0.resources.length) warnings.push("levelling asked for, but no resource in the file has a limit to level against (RSRCRATE max units per hour): the levelled runs equal the plain ones");
    for (const w of lvl0.warnings) if (!/could not be levelled/.test(w)) warnings.push(`levelling: ${w}`);
  }
  if (base.loops.length) warnings.push(`${base.loops.length} logic loop(s): activities on a loop are left out of every run`);

  const n = vary.length;
  const sumU = new Float64Array(n), sumUU = new Float64Array(n), sumUY = new Float64Array(n);
  const onPath = new Map();
  const finishes = new Float64Array(iterations);
  const plain = events.length ? new Float64Array(iterations) : null; // the same draws without the events
  const evDays = new Float64Array(iterations);
  const evDur = new Map(); // task id -> remaining minutes with this run's events added
  const rand = rng(seed);
  // events draw from their own stream, so adding a register leaves every
  // duration draw (and the run without it) exactly as it was
  const erand = rng((seed ^ 0x9e3779b9) >>> 0);
  const brand = rng((seed ^ 0x85ebca6b) >>> 0);
  const varyIds = new Set(vary.map((v) => v.t.id));
  const dropped = new Set();
  const chosen = new Array(groups.length);
  const durations = new Map();
  const us = new Float64Array(n);
  const sr = Math.sqrt(rho), se = Math.sqrt(1 - rho);
  const unlev = lvl ? new Float64Array(iterations) : null; // the same draws, not levelled
  let resLinkRuns = 0, cutRuns = 0, leftMax = 0, selfCheckMax = 0;
  const finishOf = (dm) => {
    const r = schedule(xer, { model, forwardOnly: true, durations: dm });
    if (!lvl) return { f: r.projects.get(pid).finish, r, plainF: null };
    const lr = level(xer, { ...lvl, model, projId: pid, durations: dm });
    return { f: lr.result.projects.get(pid).finish, r: lr.result, lr, plainF: r.projects.get(pid).finish };
  };
  for (let it = 0; it < iterations; it++) {
    const z0 = rho > 0 ? normal(rand) : 0;
    for (let i = 0; i < n; i++) {
      const u = rho > 0 ? phi(sr * z0 + se * normal(rand)) : rand();
      us[i] = u;
      const v = vary[i];
      durations.set(v.t.id, Math.round(triangular(u, v.a, v.c, v.b)));
    }
    // one branch per group; the work of the others is dropped from this run
    dropped.clear();
    groups.forEach((g, k) => {
      const u = brand();
      let pick = -1;
      if (g.fixed) pick = g.bs.findIndex((b) => b.name === g.fixed);
      else { let acc = 0; for (let j = 0; j < g.bs.length; j++) { acc += g.bs[j].probability; if (u < acc) { pick = j; break; } } }
      chosen[k] = pick;
      const keep = pick >= 0 ? new Set(g.bs[pick].tasks) : new Set();
      for (const t of g.all) if (!keep.has(t) && t.status !== "TK_Complete") dropped.add(t.id);
    });
    for (const id of dropped) durations.set(id, 0);
    let anyHit = false;
    const hit = events.map((e) => {
      if (erand() >= e.rk.probability) { erand(); return null; }
      anyHit = true;
      return triangular(erand(), e.rk.min, e.rk.likely, e.rk.max);
    });
    let f0 = null; // the finish without the events, when one occurred
    if (anyHit) {
      f0 = finishOf(durations).f;
      events.forEach((e, k) => {
        if (hit[k] === null) return;
        for (const t of e.targets) if (!dropped.has(t.id)) evDur.set(t.id, (evDur.get(t.id) ?? durations.get(t.id) ?? t.remain) + Math.round(hit[k] * (t.cal.hoursPerDay || 8) * 60));
      });
    }
    const run = finishOf(evDur.size ? new Map([...durations, ...evDur]) : durations);
    evDur.clear();
    const r = run.r, f = run.f;
    if (unlev) unlev[it] = run.plainF;
    finishes[it] = f;
    if (plain) plain[it] = f0 ?? f;
    const y = dayOf(f);
    events.forEach((e, k) => { if (hit[k] !== null) { e.hits++; e.sumHit += y; e.sumImpact += hit[k]; } else e.sumMiss += y; });
    evDays[it] = plain ? y - dayOf(plain[it]) : 0;
    for (let i = 0; i < n; i++) { sumU[i] += us[i]; sumUU[i] += us[i] * us[i]; sumUY[i] += us[i] * y; }
    let pathIds;
    if (run.lr) {
      const dp = levelledDrivingPath(run.lr, pid);
      pathIds = dp.path;
      if (dp.resourceLinks) resLinkRuns++;
      if (dp.cut) cutRuns++;
      leftMax = Math.max(leftMax, run.lr.left.length);
      selfCheckMax = Math.max(selfCheckMax, run.lr.resources.reduce((a, x) => a + x.selfCheckHours, 0));
    } else pathIds = drivingPath(r, pid);
    for (const id of pathIds) if (!dropped.has(id)) onPath.set(id, (onPath.get(id) || 0) + 1);
    groups.forEach((g, k) => { if (chosen[k] >= 0) { g.bs[chosen[k]].taken++; g.bs[chosen[k]].sumY += y; } else { g.noneTaken++; g.noneSumY += y; } });
    for (const id of dropped) if (!varyIds.has(id)) durations.delete(id);
    yield { done: it + 1, of: iterations };
  }

  const days = Array.from(finishes, dayOf);
  const meanY = days.reduce((a, b) => a + b, 0) / iterations;
  const varY = days.reduce((a, b) => a + (b - meanY) ** 2, 0) / iterations;
  const sorted = Array.from(finishes).sort((a, b) => a - b);
  const detDays = dayOf(p0.finish);
  const round1 = (x) => Math.round(x * 10) / 10;
  const percentiles = [10, 50, 80, 90].map((p) => {
    const d = quantile(sorted, p / 100);
    return { p, date: d, days: round1(dayOf(d)), overDeterministic: round1(dayOf(d) - detDays) };
  });
  const share = (lim) => sorted.filter((f) => f <= lim).length / iterations;

  // histogram over whole working days, at most 20 bins
  const lo = Math.floor(Math.min(...days)), hi = Math.floor(Math.max(...days));
  const width = Math.max(1, Math.ceil((hi - lo + 1) / 20));
  const histogram = [];
  for (let x = lo; x <= hi; x += width) histogram.push({ from: x, to: x + width, count: 0 });
  for (const d of days) histogram[Math.min(histogram.length - 1, Math.floor((d - lo) / width))].count++;

  // With no real effect a sample correlation over N runs has a standard
  // error near 1/sqrt(N); over thousands of activities the largest of them
  // reaches 3 to 4 of those by chance alone (200 runs on the 821-activity
  // Expressway file: 0.22 on activities never on the driving path). Below
  // 4/sqrt(N) a sensitivity is reported as null (not told apart from noise).
  const noiseFloor = 4 / Math.sqrt(iterations);
  const detPath = new Set(lvl0 ? levelledDrivingPath(lvl0, pid).path : drivingPath(base, pid));
  const activities = vary.map((v, i) => {
    const mU = sumU[i] / iterations;
    const vU = sumUU[i] / iterations - mU * mU;
    const cov = sumUY[i] / iterations - mU * meanY;
    const corr = vU > 0 && varY > 0 ? cov / Math.sqrt(vU * varY) : 0;
    return { id: v.t.id, code: v.t.code, name: v.t.name, criticality: Math.round(((onPath.get(v.t.id) || 0) / iterations) * 1000) / 1000, sensitivity: Math.round(corr * 1000) / 1000, deterministicCritical: detPath.has(v.t.id) };
  }).map((a) => ({ ...a, sensitivity: Math.abs(a.sensitivity) >= noiseFloor ? a.sensitivity : null }))
    .filter((a) => a.criticality > 0 || a.sensitivity !== null)
    .sort((a, b) => b.criticality - a.criticality || (b.sensitivity ?? 0) - (a.sensitivity ?? 0));

  // Each event's finish shift: mean finish when it occurred minus when it did
  // not. Other events and the duration draws add noise to that gap; its
  // standard error is about sd(finish) * sqrt(1/hits + 1/misses), and a shift
  // within two of those is flagged as not told apart from noise.
  const sdY = Math.sqrt(varY);
  const risks = events.map((e) => {
    const miss = iterations - e.hits;
    const shift = e.hits && miss ? e.sumHit / e.hits - e.sumMiss / miss : null;
    const se = e.hits && miss ? sdY * Math.sqrt(1 / e.hits + 1 / miss) : null;
    return {
      id: e.rk.id, probability: e.rk.probability, impact: { min: e.rk.min, likely: e.rk.likely, max: e.rk.max },
      targets: e.targets.map((t) => t.code), occurred: Math.round((e.hits / iterations) * 1000) / 1000,
      meanImpact: e.hits ? round1(e.sumImpact / e.hits) : null,
      finishShift: shift === null ? null : round1(shift),
      shiftNoise: se === null ? null : round1(2 * se),
      notNoise: shift !== null && Math.abs(shift) > 2 * se,
    };
  }).sort((a, b) => (b.finishShift ?? -Infinity) * (b.occurred || 1) - (a.finishShift ?? -Infinity) * (a.occurred || 1));
  // each branch's finish shift: mean finish when drawn minus when another
  // path was, with the same noise band as the events
  const shiftOf = (n, sum, totalN, totalSum) => {
    const m = totalN - n;
    if (!n || !m) return { finishShift: null, shiftNoise: null, notNoise: false };
    const sh = sum / n - (totalSum - sum) / m, se = sdY * Math.sqrt(1 / n + 1 / m);
    return { finishShift: round1(sh), shiftNoise: round1(2 * se), notNoise: Math.abs(sh) > 2 * se };
  };
  const sumDays = days.reduce((a, b) => a + b, 0);
  const branches = groups.map((g) => ({
    id: g.id, fixed: g.fixed,
    branches: g.bs.map((b) => ({ name: b.name, probability: b.probability, codes: b.tasks.map((t) => t.code), taken: Math.round((b.taken / iterations) * 1000) / 1000, ...shiftOf(b.taken, b.sumY, iterations, sumDays) })),
    none: g.none > 1e-9 && !g.fixed ? { probability: Math.round(g.none * 1000) / 1000, taken: Math.round((g.noneTaken / iterations) * 1000) / 1000, ...shiftOf(g.noneTaken, g.noneSumY, iterations, sumDays) } : null,
  }));
  let withoutRisks = null;
  if (plain) {
    const s0 = Array.from(plain).sort((a, b) => a - b);
    const sh0 = (lim) => s0.filter((f) => f <= lim).length / iterations;
    const ev = Array.from(evDays).sort((a, b) => a - b);
    withoutRisks = {
      percentiles: [10, 50, 80, 90].map((p) => { const d = quantile(s0, p / 100); return { p, date: d, days: round1(dayOf(d)), overDeterministic: round1(dayOf(d) - detDays) }; }),
      pDeterministic: Math.round(sh0(p0.finish) * 1000) / 1000,
      pMustFinish: p0.mustFinish != null ? Math.round(sh0(p0.mustFinish) * 1000) / 1000 : null,
      // working days the events add to the same run's finish
      eventDelay: { mean: round1(ev.reduce((a, b) => a + b, 0) / iterations), p80: round1(quantile(ev, 0.8)), noDelay: Math.round((ev.filter((d) => d <= 0).length / iterations) * 1000) / 1000 },
    };
  }

  let levelling = null;
  if (lvl) {
    const s0 = Array.from(unlev).sort((a, b) => a - b);
    const sh0 = (lim) => s0.filter((f) => f <= lim).length / iterations;
    const rd = days.map((d, i) => d - dayOf(unlev[i])).sort((a, b) => a - b);
    const lf = lvl0.result.projects.get(pid).finish;
    levelling = {
      settings: { ...lvl0.settings, limitScale: lvl.limitScale || null },
      resources: lvl0.resources.length,
      // the levelled forecast with the file's durations, and the chance of meeting it
      finish: lf, finishDays: round1(dayOf(lf)), pLevelledFinish: Math.round(share(lf) * 1000) / 1000,
      unlevelled: {
        percentiles: [10, 50, 80, 90].map((p) => { const d = quantile(s0, p / 100); return { p, date: d, days: round1(dayOf(d)), overDeterministic: round1(dayOf(d) - detDays) }; }),
        pDeterministic: Math.round(sh0(p0.finish) * 1000) / 1000,
        pMustFinish: p0.mustFinish != null ? Math.round(sh0(p0.mustFinish) * 1000) / 1000 : null,
      },
      // working days the resource limits add to the same run's finish
      resourceDelay: { mean: round1(rd.reduce((a, b) => a + b, 0) / iterations), min: round1(rd[0]), p80: round1(quantile(rd, 0.8)), noDelay: Math.round((rd.filter((d) => d <= 0).length / iterations) * 1000) / 1000 },
      // share of runs whose driving path passed through a resource wait, and
      // runs where a wait's blocker could not be named (path stopped there)
      resourceDriven: Math.round((resLinkRuns / iterations) * 1000) / 1000,
      pathCut: Math.round((cutRuns / iterations) * 1000) / 1000,
      leftMax,
      // hours any run's levelling left a placed activity over a limit (level.mjs's self-check; 0 when sound)
      selfCheckMax: Math.round(selfCheckMax * 10) / 10,
    };
    if (leftMax) warnings.push(`levelling: up to ${leftMax} activit${leftMax === 1 ? "y" : "ies"} per run could not be levelled and stay over-allocated`);
  }

  const projRow = (xer.tables.PROJECT || []).find((r) => r.proj_id === pid) || {};
  return {
    project: { id: pid, code: projRow.proj_short_name || pid, dataDate: p0.dataDate ?? null, finish: p0.finish, mustFinish: p0.mustFinish ?? null, finishDays: round1(detDays) },
    iterations, seed, range, correlation: rho, overrides: used.size - inconsistent.length, rangeSource: opts.rangeSource || null, inconsistentRanges: inconsistent.length, varied: n, noiseFloor: Math.round(noiseFloor * 1000) / 1000,
    percentiles,
    mean: { days: round1(meanY) },
    pDeterministic: Math.round(share(p0.finish) * 1000) / 1000,
    pMustFinish: p0.mustFinish != null ? Math.round(share(p0.mustFinish) * 1000) / 1000 : null,
    histogram,
    activities,
    risks,
    withoutRisks,
    branches,
    levelling,
    warnings,
  };
}

const csvCell = (v) => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// one row per activity that was on the driving path in any run or moves the finish
export function riskCsv(r) {
  const rows = [["activity_id", "name", "criticality_index", "sensitivity", "on_forecast_driving_path"]];
  for (const a of r.activities) rows.push([a.code, a.name, a.criticality, a.sensitivity ?? "", a.deterministicCritical ? "yes" : "no"]);
  return rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

// one row per branch (and the "none of these" remainder) for tables:
// [group, branch, activities, probability, drawn, finish shift text]
export function branchRows(r) {
  const shift = (b) => b.finishShift === null ? "n/a" : `${b.notNoise ? "" : "~"}${b.finishShift >= 0 ? "+" : ""}${b.finishShift.toFixed(1)}`;
  const pc = (x) => `${Math.round(x * 100)}%`;
  const rows = [];
  for (const g of r.branches || []) {
    for (const b of g.branches) rows.push([g.id, b.name + (g.fixed === b.name ? " (started)" : ""), b.codes.join(", ") || "(no work)", pc(b.probability), pc(b.taken), shift(b)]);
    if (g.none) rows.push([g.id, "none of the above", "(no work)", pc(g.none.probability), pc(g.none.taken), shift(g.none)]);
  }
  return rows;
}

export function riskAnalysis(xer, opts = {}) {
  const g = riskSteps(xer, opts);
  for (;;) { const s = g.next(); if (s.done) return s.value; }
}

// The same, handing the browser back control every ~40 ms of work;
// onProgress(done, of) after each slice.
export async function riskAnalysisAsync(xer, opts = {}, onProgress = () => {}) {
  const g = riskSteps(xer, opts);
  for (;;) {
    const t0 = Date.now();
    let s;
    do s = g.next(); while (!s.done && Date.now() - t0 < 40);
    if (s.done) return s.value;
    onProgress(s.value.done, s.value.of);
    await new Promise((r) => setTimeout(r, 0));
  }
}
