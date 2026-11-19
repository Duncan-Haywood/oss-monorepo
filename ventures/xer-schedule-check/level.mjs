// Resource levelling: delay not-started activities until the resources they
// use are within their limits, the way P6's "Level Resources" does it.
//
// level(xer, opts) -> {
//   project, settings, resources: [{ id, code, name, type, limit, before, after }],
//   activities: [{ id, code, name, es, ef, levelledStart, levelledFinish, delayDays, by }],
//   finish, levelledFinish, extensionDays, lowerBound, left: [...], passes, ms }
//
// Method (a serial levelling pass, as P6 describes its own): the schedule is
// computed with cpm.mjs; activities that use a levelled resource are taken in
// order of early start, ties broken by the file's levelling priority list
// (SCHEDOPTIONS LevelPriorityList, P6's default "priority_type,ASC"), then
// total float, then activity ID. Each is placed at the earliest start, on its
// own calendar, where every levelled resource it uses stays within its
// maximum units per hour for the whole assignment. When one has to move, its
// new start goes to the CPM engine as a start floor (options.levelStart) and
// the schedule is recomputed, so successors move by the same logic, lags and
// calendars as an unlevelled run; anything already placed whose dates the
// recompute moved is placed again. Started activities keep their dates and
// count against the limits; finished ones use nothing.
//
// Usage is units per hour over the assignment's span [start, finish): the
// assignment starts its lag (relag_drtn_hr_cnt) after the activity's
// remaining start and runs remain_qty / remain_qty_per_hr hours (or the
// activity's remaining duration) on the activity's calendar. Two activities
// on different shift calendars that never work at the same hour but whose
// spans overlap count as overlapping (conservative).
//
// Limits: RSRCRATE max_qty_per_hr in force on each date (several rows with
// start dates make the limit change over time). A resource with no positive
// limit, or RSRC.level_flag = N, or a type left out by opts.types, is not
// levelled. An assignment whose own rate is above the limit can never fit, so
// that resource is ignored for that activity and it is listed in `left`.
// Settings from the file (SCHEDOPTIONS): level within float
// (level_within_float_flag, with level_float_thrs_cnt hours to keep and
// level_over_alloc_pct allowed over the limit when float runs out).
import { buildModel, schedule } from "./cpm.mjs";
import { num, parseDate, formatDate } from "./xer.mjs";

const PRIORITY = { PT_Top: 1, PT_High: 2, PT_Normal: 3, PT_Low: 4, PT_Lowest: 5 };
const EPS = 1e-9;

function pickProject(model, projId) {
  if (projId && model.projects.has(projId)) return model.projects.get(projId);
  let best = null, n = -1;
  const count = new Map();
  for (const t of model.tasks.values()) if (!t.span && t.status !== "TK_Complete") count.set(t.proj, (count.get(t.proj) || 0) + 1);
  for (const [id, c] of count) if (c > n) { n = c; best = model.projects.get(id); }
  return best || model.projects.values().next().value;
}

// "priority_type,ASC;total_float_hr_cnt,DESC" style list -> comparator on task rows
function priorityCmp(list) {
  const keys = String(list || "priority_type,ASC").split(/[;|]/).map((s) => s.split(",").map((x) => x.trim())).filter((k) => k[0]);
  return (a, b) => {
    for (const [field, dir] of keys) {
      const va = a.row[field], vb = b.row[field];
      let c;
      if (field === "priority_type") c = (PRIORITY[va] ?? 3) - (PRIORITY[vb] ?? 3);
      else {
        const na = Number(va), nb = Number(vb);
        c = va !== "" && vb !== "" && Number.isFinite(na) && Number.isFinite(nb) ? na - nb : String(va ?? "").localeCompare(String(vb ?? ""));
      }
      if (c) return (dir || "ASC").toUpperCase() === "DESC" ? -c : c;
    }
    return 0;
  };
}

// Per resource: placed spans, kept sorted by start, with the longest span so
// a window query can start its scan at (window start - longest).
class Profile {
  constructor(limits) { this.limits = limits; this.spans = []; this.longest = 0; }
  limitAt(t) {
    let v = this.limits[0].max;
    for (const l of this.limits) if (l.from <= t) v = l.max; else break;
    return v;
  }
  // smallest limit in force anywhere in [s, e)
  limitIn(s, e) {
    let v = this.limitAt(s);
    for (const l of this.limits) if (l.from > s && l.from < e) v = Math.min(v, l.max);
    return v;
  }
  overlapping(s, e) {
    const out = [];
    const from = s - this.longest;
    let lo = 0, hi = this.spans.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (this.spans[m].s < from) lo = m + 1; else hi = m; }
    for (let i = lo; i < this.spans.length && this.spans[i].s < e; i++) {
      const x = this.spans[i];
      if (x.e > s) out.push(x);
    }
    return out;
  }
  // highest total rate of placed spans at any instant in [s, e)
  peak(s, e) {
    const ov = this.overlapping(s, e);
    if (!ov.length) return { peak: 0, spans: ov };
    const ev = [];
    for (const x of ov) { ev.push([Math.max(s, x.s), x.rate]); ev.push([Math.min(e, x.e), -x.rate]); }
    ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let cur = 0, pk = 0;
    for (const [, d] of ev) { cur += d; if (cur > pk) pk = cur; }
    return { peak: pk, spans: ov };
  }
  add(span) {
    let lo = 0, hi = this.spans.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (this.spans[m].s <= span.s) lo = m + 1; else hi = m; }
    this.spans.splice(lo, 0, span);
    if (span.e - span.s > this.longest) this.longest = span.e - span.s;
  }
  remove(taskId) { this.spans = this.spans.filter((x) => x.task !== taskId); }
}

// peak usage and hours over the limit of a set of spans against limits
function overload(spans, prof) {
  const ev = [];
  for (const x of spans) { ev.push([x.s, x.rate]); ev.push([x.e, -x.rate]); }
  for (const l of prof.limits) ev.push([l.from, 0]);
  ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let cur = 0, pk = 0, overMin = 0, prev = null;
  for (const [t, d] of ev) {
    if (prev !== null && t > prev && cur > prof.limitAt(prev) + EPS) overMin += t - prev;
    cur += d; prev = t;
    if (cur > pk) pk = cur;
  }
  return { peak: Math.round(pk * 1000) / 1000, overHours: Math.round(overMin / 6) / 10 };
}

// Hours where the limit is passed while an activity the levelling placed (not
// started, not listed as unfittable) is using the resource. Started work is
// fixed, so it alone may be over the limit; nothing placed may add to that.
// Zero when the levelling did its job.
function movedOver(spans, prof) {
  const ev = [];
  for (const x of spans) { ev.push([x.s, x.rate, x.fixed]); ev.push([x.e, -x.rate, x.fixed]); }
  for (const l of prof.limits) ev.push([l.from, 0, true]);
  ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let cur = 0, moving = 0, over = 0, prev = null;
  for (const [t, d, fixed] of ev) {
    if (prev !== null && t > prev && moving > EPS && cur > prof.limitAt(prev) * (1 + EPS) + EPS) over += t - prev;
    cur += d; if (!fixed) moving += d; prev = t;
  }
  return Math.round(over / 6) / 10;
}

export function* levelSteps(xer, opts = {}) {
  const t0 = Date.now();
  const T = xer.tables;
  const model = opts.model || buildModel(xer);
  const proj = pickProject(model, opts.projId);
  const so = (T.SCHEDOPTIONS || []).find((o) => o.proj_id === proj?.id) || (T.SCHEDOPTIONS || [])[0] || {};
  const settings = {
    withinFloat: opts.withinFloat ?? so.level_within_float_flag === "Y",
    keepFloatHours: opts.keepFloatHours ?? (num(so.level_float_thrs_cnt) ?? 0),
    overAllocPct: opts.overAllocPct ?? (num(so.level_over_alloc_pct) ?? 0),
    priorityList: opts.priorityList ?? (so.LevelPriorityList || so.level_priority_list || "priority_type,ASC"),
    types: opts.types || ["RT_Labor", "RT_Equip", "RT_Mat"],
  };
  const types = new Set(settings.types);
  const onlyRsrc = opts.resources ? new Set(opts.resources) : null;

  // resources and their limits
  const rsrc = new Map();
  for (const r of T.RSRC || []) rsrc.set(r.rsrc_id, r);
  const rates = new Map();
  for (const r of T.RSRCRATE || []) {
    const list = rates.get(r.rsrc_id) || [];
    list.push({ from: parseDate(r.start_date) ?? -Infinity, max: num(r.max_qty_per_hr) ?? 0 });
    rates.set(r.rsrc_id, list);
  }
  const profiles = new Map();
  const skipped = { noLimit: 0, flagN: 0, type: 0 };
  for (const [id, r] of rsrc) {
    const lim = (rates.get(id) || []).sort((a, b) => a.from - b.from);
    if (r.level_flag === "N") { skipped.flagN++; continue; }
    if (!types.has(r.rsrc_type)) { skipped.type++; continue; }
    if (onlyRsrc && !onlyRsrc.has(r.rsrc_short_name) && !onlyRsrc.has(id)) continue;
    if (!lim.length || !lim.some((l) => l.max > 0)) { skipped.noLimit++; continue; }
    // a zero row means "no limit given" for that period, not "none allowed"
    const scale = (opts.limitScale && (opts.limitScale[r.rsrc_short_name] ?? opts.limitScale[id] ?? opts.limitScale["*"])) || 1;
    profiles.set(id, new Profile(lim.map((l) => ({ from: l.from, max: l.max > 0 ? l.max * scale : Infinity }))));
  }

  // assignments on open activities of levelled resources
  const assigns = new Map(); // task id -> [{ rsrc, rate, lag, dur }]
  for (const a of T.TASKRSRC || []) {
    if (!profiles.has(a.rsrc_id)) continue;
    const t = model.tasks.get(a.task_id);
    if (!t || t.span || t.status === "TK_Complete") continue;
    const qty = num(a.remain_qty) ?? 0;
    let rate = num(a.remain_qty_per_hr) ?? 0;
    let dur = rate > 0 && qty > 0 ? Math.round((qty / rate) * 60) : t.remain;
    if (rate <= 0 && qty > 0 && t.remain > 0) { rate = qty / (t.remain / 60); dur = t.remain; }
    if (rate <= 0 || dur <= 0) continue;
    const list = assigns.get(t.id) || [];
    list.push({ rsrc: a.rsrc_id, rate, lag: Math.round((num(a.relag_drtn_hr_cnt) ?? 0) * 60), dur });
    assigns.set(t.id, list);
  }

  const spansOf = (t, start) => (assigns.get(t.id) || []).map((a) => {
    const s = a.lag ? t.cal.addWork(start, a.lag) : start;
    return { rsrc: a.rsrc, task: t.id, rate: a.rate, s, e: t.cal.addWork(s, a.dur), work: a.dur };
  });

  const base = schedule(xer, { model });
  const baseFinish = base.projects.get(proj.id)?.finish ?? null;
  const cmp = priorityCmp(settings.priorityList);
  const floors = new Map();
  const placed = new Map(); // task id -> es it was placed at
  const left = [];
  const leftIds = new Set();
  const by = new Map(); // task id -> resource ids that moved it
  const ignore = new Map(); // task id -> Set of rsrc ids it alone exceeds
  const moves = new Map(); // task id -> times its floor was raised
  const maxMoves = opts.maxMoves ?? 1000;
  const limitFactor = 1 + (settings.withinFloat ? settings.overAllocPct / 100 : 0);
  const keepFloat = Math.round(settings.keepFloatHours * 60);
  const horizon = 60 * 24 * 366 * 30; // stop looking 30 years on
  let cur = base, passes = 0;
  const candidates = [...assigns.keys()].filter((id) => base.tasks.has(id));

  // spans of the unlevelled schedule, for the "before" figures
  const before = new Map([...profiles.keys()].map((k) => [k, []]));
  for (const id of candidates) {
    const t = model.tasks.get(id), r = base.tasks.get(id);
    for (const sp of spansOf(t, r.remES ?? r.es)) before.get(sp.rsrc).push(sp);
  }

  for (;;) {
    passes++;
    // un-place anything the last recompute moved
    for (const [id, es] of placed) {
      const r = cur.tasks.get(id);
      if (!r || (r.remES ?? r.es) !== es) {
        placed.delete(id);
        for (const p of profiles.values()) p.remove(id);
      }
    }
    const queue = candidates.filter((id) => !placed.has(id)).map((id) => ({ id, t: model.tasks.get(id), r: cur.tasks.get(id) }));
    if (!queue.length) break;
    yield { passes, placed: placed.size, total: candidates.length };
    queue.sort((a, b) => (a.r.remES ?? a.r.es) - (b.r.remES ?? b.r.es) || cmp(a.t, b.t) || (base.tasks.get(a.id).tf ?? 0) - (base.tasks.get(b.id).tf ?? 0) || a.t.code.localeCompare(b.t.code));
    let cutoff = Infinity; // earliest new start of an activity moved this pass
    const tainted = new Set();
    let moved = false;
    for (const { id, t, r } of queue) {
      const es = r.remES ?? r.es;
      if (es >= cutoff) break;
      if (tainted.has(id)) continue;
      const commit = (start) => {
        placed.set(id, start);
        for (const sp of spansOf(t, start)) profiles.get(sp.rsrc).add(sp);
      };
      if (t.status === "TK_Active") { commit(es); continue; }
      // earliest start from es where every resource fits
      let s = es, guard = 0;
      const ign = ignore.get(id) || new Set();
      for (;;) {
        let next = null;
        for (const sp of spansOf(t, s)) {
          if (ign.has(sp.rsrc)) continue;
          const prof = profiles.get(sp.rsrc);
          const lim = prof.limitIn(sp.s, sp.e) * limitFactor;
          if (sp.rate > lim + EPS) {
            if (prof.limitIn(sp.s, sp.s + 1) * limitFactor < sp.rate - EPS || !Number.isFinite(lim)) {
              ign.add(sp.rsrc); ignore.set(id, ign);
              if (!leftIds.has(id)) { leftIds.add(id); left.push({ id, code: t.code, name: t.name, why: `alone needs ${round3(sp.rate)} of ${rsrcCode(rsrc, sp.rsrc)} per hour, limit ${round3(lim)}` }); }
              continue;
            }
          }
          const { peak, spans } = prof.peak(sp.s, sp.e);
          if (peak + sp.rate <= lim + EPS) continue;
          // the soonest a conflicting span ends after s
          let soon = Infinity;
          for (const x of spans) if (x.e > s && x.e < soon) soon = x.e;
          for (const l of prof.limits) if (l.from > sp.s && l.from < soon) soon = l.from;
          if (soon !== Infinity && (next === null || soon > next)) next = soon;
          (by.get(id) || by.set(id, new Set()).get(id)).add(sp.rsrc);
        }
        if (next === null) break;
        const ns = t.cal.nextStart(next);
        s = ns > s ? ns : t.cal.nextStart(s + 1);
        if (s > (proj.dataDate ?? es) + horizon || ++guard > 100000) break;
      }
      if (s === es) { commit(es); continue; }
      // An activity that keeps being moved is chasing itself: moving it
      // pushes a successor that, through a finish-to-finish or
      // start-to-start link, moves it or its blocker again. Leave it where
      // the logic puts it and say so, rather than run on for ever.
      const n = (moves.get(id) || 0) + 1;
      moves.set(id, n);
      const far = s > (proj.dataDate ?? es) + horizon;
      if (n > maxMoves || far) {
        if (!leftIds.has(id)) { leftIds.add(id); left.push({ id, code: t.code, name: t.name, why: far ? "would start more than 30 years after the data date: the limits are far below the work, or links to the activities it shares resources with keep pushing it" : `moved ${maxMoves} times without fitting: its links to the activities it shares resources with keep pushing it (finish-to-finish or start-to-start)` }); }
        ign.clear();
        for (const k of profiles.keys()) ign.add(k);
        ignore.set(id, ign);
        commit(es); continue;
      }
      if (settings.withinFloat) {
        const fl = base.tasks.get(id).tf ?? 0; // hours
        const room = Math.max(0, Math.round(fl * 60) - keepFloat);
        if (t.cal.workBetween(es, s) > room) {
          if (!leftIds.has(id)) { leftIds.add(id); left.push({ id, code: t.code, name: t.name, why: "no float left to level within" }); }
          commit(es); continue;
        }
      }
      floors.set(id, s);
      moved = true;
      if (s < cutoff) cutoff = s;
      // its successors' dates are now stale until the recompute
      const stack = [id];
      while (stack.length) {
        const k = stack.pop();
        for (const rel of model.tasks.get(k).succs) if (!tainted.has(rel.succId)) { tainted.add(rel.succId); stack.push(rel.succId); }
      }
    }
    if (!moved) {
      // everything left in the queue was placed or waits on nothing new
      if (candidates.every((id) => placed.has(id))) break;
    }
    cur = schedule(xer, { model, levelStart: floors, forwardOnly: true });
    if (passes > 20000) break;
  }
  const fin = schedule(xer, { model, levelStart: floors });
  const levelledFinish = fin.projects.get(proj.id)?.finish ?? null;

  const resources = [];
  for (const [id, prof] of profiles) {
    const b = before.get(id);
    if (!b.length) continue;
    const r = rsrc.get(id);
    const after = [], levelledOnly = [];
    for (const tid of candidates) {
      const fr = fin.tasks.get(tid);
      if (!fr) continue;
      for (const sp of spansOf(model.tasks.get(tid), fr.remES ?? fr.es)) if (sp.rsrc === id) {
        after.push(sp);
        if (!ignore.get(tid)?.has(id)) levelledOnly.push({ ...sp, fixed: model.tasks.get(tid).status === "TK_Active" });
      }
    }
    const work = b.reduce((n, x) => n + x.rate * x.work, 0);
    resources.push({ id, code: r.rsrc_short_name, name: r.rsrc_name, type: r.rsrc_type, limit: round3(prof.limits.at(-1).max), activities: b.length, left: [...ignore].filter(([, set]) => set.has(id)).length, before: overload(b, prof), after: overload(after, prof), afterLevelled: overload(levelledOnly, prof), selfCheckHours: movedOver(levelledOnly, prof), _work: work });
  }
  resources.sort((a, b) => b.before.overHours - a.before.overHours || a.code.localeCompare(b.code));

  const activities = [];
  // every activity the levelling moved: those it delayed (by: the resources)
  // and those their logic carried along (by: empty)
  for (const [id, r0] of base.tasks) {
    const t = model.tasks.get(id), r1 = fin.tasks.get(id);
    if (!r1 || t.span || t.status === "TK_Complete" || (t.proj !== proj.id && !opts.allProjects)) continue;
    const d = t.cal.workBetween(r0.ef, r1.ef);
    if (r1.ef === r0.ef && r1.es === r0.es) continue;
    activities.push({ id, code: t.code, name: t.name, es: formatDate(r0.remES ?? r0.es), ef: formatDate(r0.ef), levelledStart: formatDate(r1.remES ?? r1.es), levelledFinish: formatDate(r1.ef), delayDays: Math.round((d / 60 / (t.cal.hoursPerDay || 8)) * 10) / 10, by: [...(by.get(id) || [])].map((k) => rsrcCode(rsrc, k)), floor: floors.has(id) });
  }
  activities.sort((a, b) => b.delayDays - a.delayDays || a.code.localeCompare(b.code));

  // a bound no levelling can beat: a resource's remaining work at its limit
  // needs that many working hours from the data date, on the project calendar
  let lowerBound = null;
  const pcal = proj.cal;
  const aloneOver = new Set();
  for (const [id, set] of ignore) for (const k of set) aloneOver.add(k);
  for (const res of resources) {
    const lim = res.limit;
    if (aloneOver.has(res.id)) continue;
    if (!(lim > 0) || !Number.isFinite(lim)) continue;
    const hours = res._work / 60 / lim; // hours of the resource at its limit
    const bound = pcal.addWork(pcal.nextStart(proj.dataDate), Math.round(hours * 60));
    if (lowerBound === null || bound > lowerBound.date) lowerBound = { date: bound, rsrc: res.code };
  }
  for (const res of resources) delete res._work;
  // P6 gives every new resource a limit of 8 h a day (1 per hour); a file
  // that never set real crew sizes levels against that and runs on for years
  const warnings = [];
  const dflt = resources.filter((x) => x.limit === 1 && x.before.peak >= 3);
  if (dflt.length) warnings.push(`${dflt.length} resource${dflt.length === 1 ? "" : "s"} (${dflt.slice(0, 5).map((x) => x.code).join(", ")}${dflt.length > 5 ? ", ..." : ""}) ha${dflt.length === 1 ? "s" : "ve"} a limit of 1 unit per hour, P6's default for a new resource, but the schedule uses up to ${Math.max(...dflt.map((x) => x.before.peak))} at once: if that limit was never set on purpose, set the real crew or fleet size (RSRCRATE max units) before trusting the levelled dates`);
  if (left.length) warnings.push(`${left.length} activit${left.length === 1 ? "y" : "ies"} could not be levelled and stay over-allocated (listed with the reason)`);
  const hpd = pcal.hoursPerDay || 8;
  return {
    project: { id: proj.id, code: proj.code, dataDate: formatDate(proj.dataDate) },
    settings: { ...settings, skipped },
    resources,
    activities,
    left,
    finish: formatDate(baseFinish),
    levelledFinish: formatDate(levelledFinish),
    extensionDays: baseFinish !== null && levelledFinish !== null ? Math.round((pcal.workBetween(baseFinish, levelledFinish) / 60 / hpd) * 10) / 10 : null,
    lowerBound: lowerBound ? { date: formatDate(lowerBound.date), resource: lowerBound.rsrc } : null,
    warnings,
    passes,
    floors,
    result: fin,
    ms: Date.now() - t0,
  };
}

export function level(xer, opts = {}) {
  const g = levelSteps(xer, opts);
  for (;;) { const r = g.next(); if (r.done) return r.value; }
}

// the same, giving the page's event loop a turn every ~50 ms
export async function levelAsync(xer, opts = {}, onProgress = () => {}) {
  const g = levelSteps(xer, opts);
  let t = Date.now();
  for (;;) {
    const r = g.next();
    if (r.done) return r.value;
    if (Date.now() - t > 50) { onProgress(r.value); await new Promise((ok) => setTimeout(ok, 0)); t = Date.now(); }
  }
}

const round3 = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : x);
const rsrcCode = (rsrc, id) => rsrc.get(id)?.rsrc_short_name || id;

const csvCell = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) || /^[=+\-@\t\r]/.test(s) ? `"${(/^[=+\-@\t\r]/.test(s) ? "'" : "") + s.replace(/"/g, '""')}"` : s;
};

export function levelCsv(r) {
  const head = ["activity_id", "name", "early_start", "early_finish", "levelled_start", "levelled_finish", "delay_working_days", "moved_by_resources"];
  const rows = r.activities.map((a) => [a.code, a.name, a.es, a.ef, a.levelledStart, a.levelledFinish, a.delayDays, a.by.join(" ")]);
  return [head, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
