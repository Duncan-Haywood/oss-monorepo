// Joint acceleration ("crashing"): the cheapest set of activities to shorten
// together to bring the forecast finish in, step by step, with what each day
// costs.
//
// Drag (drag.mjs) answers one activity at a time, so where two chains of
// equal length run side by side it reports 0 for both: shortening either
// alone wins nothing. terminal-building-airport has 33 longest-path
// activities and only one with drag. The finish still comes in if both
// chains are shortened at once, and which pair (or triple) to shorten is a
// minimum cut: the cheapest set of activities that every driving chain into
// the finish passes through. That is the classic time-cost trade-off
// (Kelley 1961; Fulkerson 1961; Phillips and Dessouky 1977), computed here
// greedily on the P6 engine's own schedule:
//
//   1. schedule (cpm.mjs) with the shortenings so far;
//   2. take the driving network into the finish (floatpaths.mjs
//      longestPath: every chain of relationships with zero relationship
//      float into an activity finishing on the forecast finish);
//   3. build an event graph on it (each activity a start node and a finish
//      node joined by its duration; FS/SS/FF/SF links between the ends they
//      join; a start pulled back from a driven finish joined finish-to-start),
//      give each duration the activity's acceleration cost per hour if it has
//      room left, unlimited otherwise, and find the minimum cut (max flow);
//   4. shorten every activity in the cut by the same working time, the least
//      (bisection on 6-minute steps) that wins what the step can win, up to
//      one project-calendar day, and reschedule to measure the gain;
//   5. repeat until the target is met, no cut is finite (some chain has
//      nothing left to shorten), or, with a cost per day of finish, a day
//      costs more to win than it is worth.
//
// Every gain is measured by rescheduling, never assumed from the graph, so
// calendars, lag calendars, constraints and progress count as the rest of
// the tool schedules them. A cut may also cross an activity already
// shortened backwards: that activity is given the time back and its cost
// refunded (Phillips and Dessouky's un-crashing, a lower bound on its
// duration edge), without which a bridge network pays up to 19% more than it
// needs to (eval/crash-bridge.mjs). Against brute force over every
// whole-day combination (eval/crash-oracle.mjs, crash.test.mjs) every step
// tested cost the least its gain can cost (random finish-to-start networks
// on whole days: a measurement, not a proof for every network). A cut that wins nothing within its
// room (a calendar staircase, reverse drag) is set aside and the next
// cheapest is tried.
//
// Acceleration data per activity: `room` (working hours it can lose) and
// `costPerDay` (what a working day of shortening costs: overtime, a second
// crew). Without data every task may lose `maxFraction` of its remaining
// duration (default 0.25) at cost 1 per working day, so the "cost" counts
// activity-days of acceleration. Milestones, level of effort, WBS summaries,
// activities held by a mandatory constraint or (with "use expected finish
// dates") an expected finish are never shortened.
//
// crashAnalysis(xer, { projId, targetDays, data, maxFraction, costPerDay,
//   maxRuns, expectedFinish }) ->
//   { project, finishBefore, finishAfter, steps, activities, gainedDays,
//     totalCost, stoppedBecause, runs, ms, warnings }
import { buildModel, schedule } from "./cpm.mjs";
import { pickProject } from "./compare.mjs";
import { longestPath, drivingInto, relationshipFloat } from "./floatpaths.mjs";
import { formatDate } from "./xer.mjs";

const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;
export const MAX_RUNS = 600;
const MANDATORY = ["CS_MANDFIN", "CS_MANDSTART", "CS_MEO", "CS_MSO"];

// Minimum s-t cut on a small graph whose edges are [u, v, cap, low]: cap may
// be Infinity, low (a lower bound on the flow, default 0) is what a cut
// crossing the edge backwards takes off its value. With lower bounds the
// cut's value is sum(cap forward) - sum(low backward) (Phillips and
// Dessouky 1977: the low bound on a shortened activity is its refund for
// being lengthened back). Max flow with lower bounds: a feasible circulation
// first (super source and sink, t -> s unbounded), then Edmonds-Karp from s
// to t on what is left. Returns { flow, side } (side: the source side) or
// { flow: Infinity } when a path of unbounded edges joins s to t.
export function minCut(n, edges, s, t) {
  const N = n + 2, SS = n, TT = n + 1;
  const adj = Array.from({ length: N }, () => []);
  const to = [], cap = [];
  const add = (u, v, c) => {
    adj[u].push(to.length); to.push(v); cap.push(c);
    adj[v].push(to.length); to.push(u); cap.push(0);
    return to.length - 2;
  };
  const excess = new Array(n).fill(0);
  for (const [u, v, c, low = 0] of edges) {
    add(u, v, c - low);
    if (low > 0) { excess[v] += low; excess[u] -= low; }
  }
  const back = add(t, s, Infinity);
  let need = 0;
  for (let v = 0; v < n; v++) {
    if (excess[v] > 1e-12) { add(SS, v, excess[v]); need += excess[v]; }
    else if (excess[v] < -1e-12) add(v, TT, -excess[v]);
  }
  const augment = (a, b) => {
    let flow = 0;
    for (;;) {
      const prev = new Array(N).fill(-1);
      prev[a] = -2;
      const q = [a];
      for (let i = 0; i < q.length && prev[b] === -1; i++) {
        const u = q[i];
        for (const e of adj[u]) if (cap[e] > 1e-12 && prev[to[e]] === -1) { prev[to[e]] = e; q.push(to[e]); }
      }
      if (prev[b] === -1) return flow;
      let m = Infinity;
      for (let v = b; v !== a; v = to[prev[v] ^ 1]) m = Math.min(m, cap[prev[v]]);
      if (m === Infinity) return Infinity;
      for (let v = b; v !== a; v = to[prev[v] ^ 1]) { cap[prev[v]] -= m; cap[prev[v] ^ 1] += m; }
      flow += m;
    }
  };
  if (need > 0) {
    const f = augment(SS, TT);
    if (f !== Infinity && f < need - 1e-9) throw new Error("minCut: lower bounds cannot be met");
  }
  // flow already circulating through t -> s counts toward the s-t flow
  let flow = need > 0 ? cap[back ^ 1] : 0;
  cap[back] = 0; cap[back ^ 1] = 0;
  for (const e of adj[SS]) { cap[e] = 0; cap[e ^ 1] = 0; }
  for (const e of adj[TT]) { cap[e] = 0; cap[e ^ 1] = 0; }
  const more = augment(s, t);
  if (more === Infinity) return { flow: Infinity, side: null };
  flow += more;
  const side = new Set([s]);
  const q = [s];
  for (let i = 0; i < q.length; i++) for (const e of adj[q[i]]) if (cap[e] > 1e-12 && !side.has(to[e])) { side.add(to[e]); q.push(to[e]); }
  return { flow, side };
}

// Acceleration data from CSV text: activity_id, max_shorten_days (working
// days on the activity's calendar), cost_per_day. Header names are matched
// loosely; either number may be blank.
export function parseCrashData(text) {
  const lines = String(text).replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return new Map();
  const split = (l) => { const out = []; let cur = "", q = false; for (let i = 0; i < l.length; i++) { const c = l[i]; if (q) { if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; } else if (c === '"') q = true; else if (c === "," || c === "\t" || c === ";") { out.push(cur); cur = ""; } else cur += c; } out.push(cur); return out.map((s) => s.trim()); };
  const head = split(lines[0]).map((h) => h.toLowerCase());
  const col = (re) => head.findIndex((h) => re.test(h));
  let ci = col(/activity|code|task|^id$/), ri = col(/max|room|shorten|crash/), ki = col(/cost/);
  let body = lines.slice(1);
  if (ci < 0) { ci = 0; ri = 1; ki = 2; body = lines; }
  const num = (s) => { if (s === undefined || s === "") return null; const v = Number(String(s).replace(/[$,\s]/g, "")); return Number.isFinite(v) && v >= 0 ? v : null; };
  const m = new Map();
  for (const l of body) {
    const c = split(l);
    if (!c[ci]) continue;
    m.set(c[ci], { roomDays: ri >= 0 ? num(c[ri]) : null, costPerDay: ki >= 0 ? num(c[ki]) : null });
  }
  return m;
}

export function crashAnalysis(xer, { projId = null, targetDays = null, data = null, maxFraction = 0.25, costPerDay = null, maxRuns = MAX_RUNS, expectedFinish = true, giveBack = true, model: model0 = null } = {}) {
  const t0 = Date.now();
  const model = model0 || buildModel(xer);
  const ex = expectedFinish === false ? { expectedFinish: false } : {};
  const base = schedule(null, { model, ...ex, forwardOnly: true });
  const p = pickProject(xer, model, projId);
  if (!p) throw new Error("no project in the file");
  const F0 = base.projects.get(p.id)?.finish;
  if (F0 === null || F0 === undefined || !Number.isFinite(F0)) throw new Error("the project has no forecast finish (is every activity complete?)");
  const pcal = p.cal, hpd = pcal.hoursPerDay || 8;
  const warnings = [];
  const value = costPerDay !== null && costPerDay !== undefined && Number(costPerDay) > 0 ? Number(costPerDay) : null;
  const target = targetDays !== null && targetDays !== undefined && Number(targetDays) > 0 ? Math.round(Number(targetDays) * hpd * 60) : null;
  const frac = Math.max(0, Math.min(1, Number(maxFraction) || 0));
  const dataMap = data instanceof Map ? data : data ? parseCrashData(data) : null;
  const unmatched = dataMap ? new Set(dataMap.keys()) : new Set();
  for (const t of model.tasks.values()) if (t.proj === p.id) unmatched.delete(String(t.code));

  // room (minutes) and cost per minute, per activity id; null = not shortenable
  const spec = new Map();
  const why = new Map();
  const specOf = (t) => {
    if (spec.has(t.id)) return spec.get(t.id);
    let s = null;
    const thpd = t.cal.hoursPerDay || hpd;
    const d = dataMap ? dataMap.get(String(t.code)) : undefined;
    if (t.proj !== p.id || t.span || t.status === "TK_Complete") why.set(t.id, "outside the project or complete");
    else if (t.type === "TT_Mile" || t.type === "TT_FinMile" || !(t.remain > 0)) why.set(t.id, "milestone or no remaining duration");
    else if (t.cstr.some((c) => MANDATORY.includes(c.type))) why.set(t.id, "mandatory constraint");
    else if (expectedFinish !== false && p.useExpectedFinish && t.expEnd !== null && t.expEnd !== undefined) why.set(t.id, "expected finish sets its duration");
    else {
      const room = d && d.roomDays !== null ? Math.round(d.roomDays * thpd * 60) : dataMap && !d ? 0 : Math.floor(t.remain * frac);
      const perDay = d && d.costPerDay !== null ? d.costPerDay : 1;
      const roomCap = Math.min(room, t.remain);
      if (roomCap > 0) s = { room: roomCap, perMin: perDay / (thpd * 60), perDay };
      else why.set(t.id, dataMap && !d ? "not in the acceleration data" : "no acceleration room");
    }
    spec.set(t.id, s);
    return s;
  };

  const used = new Map(); // id -> minutes shortened so far
  // shorten: ids taken x minutes shorter; back: ids given x minutes back
  const durs = (shorten = [], back = [], x = 0) => {
    const m = new Map();
    for (const [id, u] of used) m.set(id, model.tasks.get(id).remain - u);
    for (const id of shorten) m.set(id, model.tasks.get(id).remain - (used.get(id) || 0) - x);
    for (const id of back) m.set(id, model.tasks.get(id).remain - (used.get(id) || 0) + x);
    return m;
  };
  let runs = 0;
  const run = (shorten, back, x) => { runs++; return schedule(null, { model, ...ex, forwardOnly: true, durations: durs(shorten, back, x) }); };
  const gainOf = (f) => (f <= F0 ? pcal.workBetween(f, F0) : -pcal.workBetween(F0, f)); // minutes

  const steps = [];
  let cur = base, curGain = 0, totalCost = 0, stoppedBecause = null;
  let noBackWarned = false;
  const blocked = new Set(); // cut members that won nothing: treated as fixed
  for (;;) {
    if (target !== null && curGain >= target) { stoppedBecause = "target met"; break; }
    if (runs >= maxRuns) { stoppedBecause = "run budget"; warnings.push(`stopped after ${runs} reschedules (raise maxRuns to go further)`); break; }
    // the driving network into every open activity that finishes on the
    // forecast finish in working time (a zero-duration activity finishes at
    // the next day's start, a parallel chain at the previous day's end:
    // floatpaths.mjs longestPath compares the timestamps, so it keeps one)
    const fin = cur.projects.get(p.id).finish;
    const atFinish = (id) => { const e = cur.tasks.get(id)?.ef; return e !== undefined && e !== null && (e === fin || (e < fin ? pcal.workBetween(e, fin) : pcal.workBetween(fin, e)) === 0); };
    const ends = [];
    for (const t of model.tasks.values()) if (t.proj === p.id && !t.span && t.status !== "TK_Complete" && atFinish(t.id)) ends.push(t.id);
    const L = [...drivingInto(cur, ends)];
    const idx = new Map(L.map((id, i) => [id, i]));
    const S = (i) => 2 * i, Fn = (i) => 2 * i + 1, src = 2 * L.length, snk = src + 1;
    const edges = [];
    const startDriven = new Set(), finDriven = new Set();
    for (const id of L) {
      const t = model.tasks.get(id);
      for (const rel of t.preds) {
        if (!idx.has(rel.predId) || relationshipFloat(cur, rel) !== 0) continue;
        const a = rel.type === "PR_FS" || rel.type === "PR_FF" ? Fn(idx.get(rel.predId)) : S(idx.get(rel.predId));
        const toStart = rel.type === "PR_FS" || rel.type === "PR_SS";
        edges.push([a, toStart ? S(idx.get(id)) : Fn(idx.get(id)), Infinity]);
        (toStart ? startDriven : finDriven).add(id);
      }
    }
    for (const id of L) {
      const i = idx.get(id), t = model.tasks.get(id);
      const s = specOf(t);
      const left = s ? s.room - (used.get(id) || 0) : 0;
      // forward: cost of shortening while there is room; low bound: the
      // refund for giving back time already bought (un-crashing)
      edges.push([S(i), Fn(i), s && left > 0 && !blocked.has(id) ? s.perMin : Infinity, giveBack && s && (used.get(id) || 0) > 0 ? s.perMin : 0]);
      if (!startDriven.has(id)) edges.push(finDriven.has(id) ? [Fn(i), S(i), Infinity] : [src, S(i), Infinity]);
      if (atFinish(id)) edges.push([Fn(i), snk, Infinity]);
    }
    // a refund bound needs the finish to lead on (a duration whose finish
    // drives nothing in the network is not on any chain through its finish)
    const outOf = new Set(edges.map((e) => e[0]));
    for (const e of edges) if (e[3] > 0 && !outOf.has(e[1])) e[3] = 0;
    let mc;
    try { mc = minCut(snk + 1, edges, src, snk); } catch {
      if (!noBackWarned) { warnings.push("giving back time already bought was not possible at one step (its bounds conflict); that step only shortens"); noBackWarned = true; }
      mc = minCut(snk + 1, edges.map(([u, v, c]) => [u, v, c]), src, snk);
    }
    if (mc.flow === Infinity) { stoppedBecause = "no finite cut: a driving chain has nothing left to shorten"; break; }
    const cut = L.filter((id) => mc.side.has(S(idx.get(id))) && !mc.side.has(Fn(idx.get(id))));
    const back = L.filter((id) => !mc.side.has(S(idx.get(id))) && mc.side.has(Fn(idx.get(id))) && (used.get(id) || 0) > 0);
    if (!cut.length) { stoppedBecause = "no finite cut: a driving chain has nothing left to shorten"; break; }
    // cost per minute of the step: shortened ones bought, given-back ones refunded
    const rate = cut.reduce((a, id) => a + spec.get(id).perMin, 0) - back.reduce((a, id) => a + spec.get(id).perMin, 0);
    let step = Math.min(hpd * 60, ...cut.map((id) => spec.get(id).room - (used.get(id) || 0)), ...back.map((id) => used.get(id)));
    const want = target !== null ? target - curGain : Infinity;
    const g = (x) => gainOf(run(cut, back, x).projects.get(p.id).finish) - curGain;
    // a calendar staircase can win nothing for the first day or two of
    // shortening (Expressway's NC/1000 wins nothing until 27 h): try 2, 3,
    // 4 and 5 steps, within the room, before giving the cut up
    const maxStep = Math.min(...cut.map((id) => spec.get(id).room - (used.get(id) || 0)), ...back.map((id) => used.get(id)));
    let gs = g(step);
    for (let k = 2; gs <= 0 && k <= 5 && step < maxStep; k++) { step = Math.min(maxStep, step * k / (k - 1)); gs = g(step); }
    if (gs <= 0) {
      for (const id of cut) blocked.add(id);
      warnings.push(`shortening ${cut.map((id) => model.tasks.get(id).code).join(" + ")} together by ${r1(step / 60)} h won nothing (a calendar step or reverse drag); left as is`);
      continue;
    }
    const aim = Math.min(gs, want);
    let lo = 0, hi = step;
    while (hi - lo > 6) { const mid = Math.round((lo + hi) / 2); if (g(mid) >= aim) hi = mid; else lo = mid; }
    const x = hi;
    const res = run(cut, back, x);
    const gained = gainOf(res.projects.get(p.id).finish) - curGain;
    const cost = rate * x;
    const calDays = (cur.projects.get(p.id).finish - res.projects.get(p.id).finish) / 1440;
    const perFinishDay = calDays > 0 ? cost / calDays : null;
    if (value !== null && perFinishDay !== null && perFinishDay > value) { stoppedBecause = `the next day costs ${Math.round(perFinishDay)} per calendar day, more than the ${value} a day of finish is worth`; break; }
    for (const id of cut) used.set(id, (used.get(id) || 0) + x);
    for (const id of back) { const u = used.get(id) - x; if (u > 0) used.set(id, u); else used.delete(id); }
    curGain += gained; totalCost += cost; cur = res;
    steps.push({
      n: steps.length + 1,
      activities: cut.map((id) => ({ code: model.tasks.get(id).code, name: model.tasks.get(id).name, hours: r1(x / 60) })),
      givenBack: back.map((id) => ({ code: model.tasks.get(id).code, name: model.tasks.get(id).name, hours: r1(x / 60) })),
      shortenHours: r1(x / 60), gainedHours: r1(gained / 60), gainedDays: r2(gained / 60 / hpd), calendarDays: r2(calDays),
      cost: r2(cost), costPerWorkingDay: gained > 0 ? r2(cost / (gained / 60 / hpd)) : null,
      cumulativeDays: r2(curGain / 60 / hpd), cumulativeCost: r2(totalCost),
      finish: formatDate(res.projects.get(p.id).finish), longestPathSize: L.length,
    });
    if (steps.length >= 500) { stoppedBecause = "500 steps"; break; }
  }
  if (unmatched.size) warnings.push(`${unmatched.size} activity ID(s) in the acceleration data are not in the project: ${[...unmatched].slice(0, 5).join(", ")}${unmatched.size > 5 ? ", ..." : ""}`);
  if (!steps.length && stoppedBecause?.startsWith("no finite cut")) {
    const lp = [...longestPath(base, p.id)].map((id) => model.tasks.get(id)).filter((t) => !specOf(t) && t.remain > 0);
    if (lp.length) warnings.push(`longest-path activities that cannot be shortened: ${lp.slice(0, 8).map((t) => `${t.code} (${why.get(t.id)})`).join(", ")}${lp.length > 8 ? ", ..." : ""}`);
  }
  const activities = [...used].map(([id, u]) => {
    const t = model.tasks.get(id), s = spec.get(id);
    return { code: t.code, name: t.name, remainingDays: r2(t.remain / 60 / (t.cal.hoursPerDay || hpd)), shortenMinutes: u, shortenHours: r1(u / 60), shortenDays: r2(u / 60 / (t.cal.hoursPerDay || hpd)), costPerDay: s.perDay, cost: r2(s.perMin * u), roomLeftHours: r1((s.room - u) / 60) };
  }).sort((a, b) => b.shortenHours - a.shortenHours || String(a.code).localeCompare(String(b.code)));
  return {
    project: { id: p.id, code: p.code, dataDate: formatDate(p.dataDate) },
    finishBefore: formatDate(F0), finishAfter: formatDate(cur.projects.get(p.id).finish), hoursPerDay: hpd,
    targetDays: target === null ? null : r2(target / 60 / hpd), costPerDay: value, defaults: dataMap ? null : { maxFraction: frac, costPerDay: 1 },
    steps, activities, gainedDays: r2(curGain / 60 / hpd), totalCost: r2(totalCost), stoppedBecause,
    runs, ms: Date.now() - t0, warnings: [...warnings, ...base.warnings],
  };
}

const money = (n) => (n === null || n === undefined ? "" : Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 }));

export function crashText(r, { limit = 30 } = {}) {
  const out = [];
  out.push(`${r.project.code}: joint acceleration, forecast finish ${r.finishBefore} -> ${r.finishAfter} (data date ${r.project.dataDate})`);
  out.push(`${r.gainedDays} working days won in ${r.steps.length} step(s) at a total cost of ${money(r.totalCost)}${r.defaults ? ` (no acceleration data: each task may lose ${Math.round(r.defaults.maxFraction * 100)}% of its remaining duration, cost 1 per working day, so cost = activity-days shortened)` : ""}; stopped: ${r.stoppedBecause} (${r.runs} reschedules, ${r.ms} ms)`);
  out.push("", "  step  shorten together (h)                         won (d)  total (d)  cost/day   finish");
  for (const s of r.steps.slice(0, limit)) out.push(`  ${String(s.n).padStart(4)}  ${(s.activities.map((a) => a.code).join(" + ") + (s.givenBack.length ? ` (give back ${s.givenBack.map((a) => a.code).join(" + ")})` : "")).slice(0, 40).padEnd(40)} ${String(s.shortenHours).padStart(5)}  ${String(s.gainedDays).padStart(6)}  ${String(s.cumulativeDays).padStart(9)}  ${String(money(s.costPerWorkingDay)).padStart(8)}   ${s.finish}`);
  if (r.steps.length > limit) out.push(`  ... ${r.steps.length - limit} more (--json or --csv for all)`);
  if (r.activities.length) {
    out.push("", "Shortened in all:");
    for (const a of r.activities.slice(0, limit)) out.push(`  ${String(a.shortenDays).padStart(6)} d of ${String(a.remainingDays).padEnd(6)}  ${money(a.cost).padStart(10)}  ${a.code}  ${a.name ?? ""}`);
  }
  if (r.warnings.length) out.push("", ...r.warnings.map((w) => `- ${w}`));
  out.push("", "Each step shortens the cheapest set of activities that every driving chain into the finish passes through (a minimum cut), then reschedules to measure the gain.");
  return out.join("\n") + "\n";
}

const csvCell = (v) => {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function crashCsv(r) {
  const rows = [["step", "activities", "given_back", "shorten_hours_each", "won_working_days", "won_calendar_days", "step_cost", "cost_per_working_day", "cumulative_days", "cumulative_cost", "finish"]];
  for (const s of r.steps) rows.push([s.n, s.activities.map((a) => a.code).join(" + "), s.givenBack.map((a) => a.code).join(" + "), s.shortenHours, s.gainedDays, s.calendarDays, s.cost, s.costPerWorkingDay ?? "", s.cumulativeDays, s.cumulativeCost, s.finish]);
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
export function crashTableHtml(r, { limit = 30 } = {}) {
  const rows = r.steps.slice(0, limit).map((s) => `<tr><td class="n">${s.n}</td><td>${s.activities.map((a) => esc(a.code)).join(" + ")}${s.givenBack.length ? ` <span class="note">(give back ${s.givenBack.map((a) => esc(a.code)).join(" + ")})</span>` : ""}</td><td class="n">${esc(s.shortenHours)}</td><td class="n">${esc(s.gainedDays)}</td><td class="n"><b>${esc(s.cumulativeDays)}</b></td><td class="n">${esc(money(s.costPerWorkingDay))}</td><td>${esc(s.finish.slice(0, 10))}</td></tr>`).join("");
  return `<table><thead><tr><th class="n">Step</th><th>Shorten together</th><th class="n">By (h each)</th><th class="n">Won (d)</th><th class="n">Total (d)</th><th class="n">Cost per day won</th><th>New finish</th></tr></thead><tbody>${rows}</tbody></table>${r.steps.length > limit ? `<p class="note">${r.steps.length - limit} more steps in the CSV.</p>` : ""}`;
}
