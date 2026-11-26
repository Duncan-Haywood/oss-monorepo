// Longest path and multiple float paths on a scheduled network (cpm.mjs).
//
// longestPath(result, projId) -> Set(task_id)
//   Every open activity from which a chain of driving relationships reaches
//   an activity that finishes on the project's early finish: P6's "longest
//   path" (TASK.driving_path_flag). A relationship drives when the
//   predecessor, plus the lag, leaves its successor no working time: the
//   successor starts (FS, SS) or finishes (FF, SF) exactly where the link
//   lets it. Every driving branch is kept, not only the first one, so two
//   parallel chains that both end on the finish are both on it. Checked on
//   six public P6 files (eval/longest-path-2026-11-19.md).
//
// floatPaths(result, targetId, { count }) -> {
//   target, paths: [{ n, float, activities: [{ id, code, name, start, finish,
//   tf, rf, link }] }], unreached
// }
//   Multiple float paths to one activity, in the manner of P6's "free float"
//   option: path 1 is the driving chain to the target; each later path is
//   the chain with the least float *relative to the target* among the
//   activities not yet on a path. Relative float is total float computed as
//   if the target were the only finish: a backward pass from the target's
//   early finish over its predecessors alone (targetBound), measured in
//   hours on each activity's own calendar by the project's float type. It
//   says how far the activity can slip before it moves the target, what a
//   delay analyst asks of a milestone that is not the project finish (total
//   float answers it only for the finish, and not at all under a
//   must-finish-by date or a constraint). A path is traced backward from its
//   seed (the unassigned activity with the least relative float, latest
//   finish first on ties) through the predecessor whose target-bound late
//   date it sets and that has no more relative float, until it joins an
//   activity already on a path or runs out, so every activity on a path has
//   the path's relative float (to 0.01 h).
//   Not compared with P6's own float paths: none of the six public files
//   stores them (TASK.float_path is empty in all six).
//   Completed activities, level of effort and WBS summaries are left out:
//   they cannot slip.

import { Calendar } from "./calendar.mjs";
import { formatDate } from "./xer.mjs";

function lagCalendar(model, rel) {
  const pred = model.tasks.get(rel.predId);
  const succ = model.tasks.get(rel.succId);
  const proj = model.projects.get(succ.proj);
  switch (rel.lagCal || (proj ? proj.lagCal : "rcal_Predecessor")) {
    case "rcal_Successor": return succ.cal;
    case "rcal_24Hour": return Calendar.allDay();
    case "rcal_ProjDefault": return proj.cal;
    default: return pred.cal;
  }
}

const open = (t) => t && !t.span && t.status !== "TK_Complete";

// Working minutes the successor could wait before this link held it: 0 when
// the link drives. Null when either end has no dates.
export function relationshipFloat(result, rel) {
  const { model, tasks: res } = result;
  const pred = model.tasks.get(rel.predId), succ = model.tasks.get(rel.succId);
  const pv = res.get(rel.predId), sv = res.get(rel.succId);
  if (!pv || !sv || pv.ef === undefined || sv.ef === undefined) return null;
  const from = rel.type === "PR_FS" || rel.type === "PR_FF" ? pv.ef : pv.remES ?? pv.es;
  const target = rel.type === "PR_FS" || rel.type === "PR_SS" ? sv.remES ?? sv.es : sv.ef;
  const reach = lagCalendar(model, rel).addWork(from, rel.lag);
  return succ.cal.workBetween(reach, target);
}

export function longestPath(result, projId) {
  const { model, tasks: res } = result;
  const p = result.projects.get(projId);
  if (!p || p.finish === null || p.finish === undefined) return new Set();
  const ends = [];
  for (const t of model.tasks.values()) {
    if (t.proj !== projId || !open(t)) continue;
    const r = res.get(t.id);
    if (r && r.ef === p.finish) ends.push(t.id);
  }
  return drivingInto(result, ends);
}

// Every open activity a chain of driving links leads from into one of `ids`
// (the ids included).
export function drivingInto(result, ids) {
  const { model } = result;
  const set = new Set(ids);
  const stack = ids.map((id) => model.tasks.get(id));
  while (stack.length) {
    const cur = stack.pop();
    for (const rel of cur.preds) {
      const pr = model.tasks.get(rel.predId);
      if (!open(pr) || set.has(pr.id)) continue;
      if (relationshipFloat(result, rel) === 0) { set.add(pr.id); stack.push(pr); }
    }
  }
  return set;
}

// The activity a project's longest path ends on: of the open activities
// finishing on the project finish, the one with the most activities driving
// into it (then one with no successors), so the float paths run to the end
// of the chain that sets the finish, not to a milestone that only shares it.
export function finishActivity(result, projId) {
  const { model, tasks: res } = result;
  const p = result.projects.get(projId);
  if (!p || p.finish == null) return null;
  let best = null, bestN = -1;
  for (const t of model.tasks.values()) {
    if (t.proj !== projId || !open(t)) continue;
    const r = res.get(t.id);
    if (!r || r.ef !== p.finish) continue;
    const n = drivingInto(result, [t.id]).size;
    if (n > bestN || (n === bestN && t.succs.length === 0 && best.succs.length > 0)) { best = t; bestN = n; }
  }
  return best;
}

// Late dates bound by the target alone: a backward pass from the target over
// its open predecessors, with the target's late finish at `seed` (its early
// finish for relative float) and no other successor, constraint or project
// date. Mirrors the open-activity rules of cpm.mjs's backward pass (an
// active successor's SF link is met; under progress override an active
// successor binds nothing; a started predecessor's SS lag is spent).
// Completed activities are left out, so a route through a finished node does
// not bind: the bound is then looser than cpm.mjs's, never tighter. Returns Map(id -> { lf, ls, via }), `via` being
// the link that set the date.
export function targetBound(result, targetId, seed) {
  const { model, tasks: res } = result;
  const bound = new Map();
  const tgt = model.tasks.get(targetId), tr = res.get(targetId);
  const tls = tgt.cal.subWork(seed, tr.rem ?? tgt.remain);
  bound.set(targetId, { lf: seed, ls: tgt.type === "TT_FinMile" || tgt.type === "TT_Mile" ? seed : tgt.cal.nextStart(tls), via: null });
  // the target's open predecessor cone, in reverse topological order
  const cone = new Set([targetId]);
  const stack = [tgt];
  while (stack.length) {
    const t = stack.pop();
    for (const rel of t.preds) { const pr = model.tasks.get(rel.predId); if (open(pr) && res.get(pr.id) && !cone.has(pr.id)) { cone.add(pr.id); stack.push(pr); } }
  }
  // count successors inside the cone, then peel from the target backward
  const outdeg = new Map([...cone].map((id) => [id, model.tasks.get(id).succs.filter((r) => cone.has(r.succId) && r.succId !== id).length]));
  outdeg.set(targetId, 0);
  const queue = [targetId];
  const seen = new Set();
  for (let qi = 0; qi < queue.length; qi++) {
    const id = queue[qi];
    if (seen.has(id)) continue;
    seen.add(id);
    const t = model.tasks.get(id);
    if (id !== targetId) {
      const r = res.get(id), cal = t.cal, remain = r.rem ?? t.remain;
      let fMin = Infinity, sMin = Infinity, fVia = null, sVia = null;
      for (const rel of t.succs) {
        const b = bound.get(rel.succId);
        if (!b || !cone.has(rel.succId)) continue;
        const s = model.tasks.get(rel.succId);
        const act = s.status === "TK_Active";
        if (act && (model.projects.get(s.proj)?.progressOverride || rel.type === "PR_SF")) continue;
        const lc = lagCalendar(model, rel);
        let v, fin;
        if (rel.type === "PR_FS") { v = lc.subWork(b.ls, rel.lag); fin = true; }
        // a started predecessor's SS lag is spent: its remaining work may
        // start as late as the successor (cpm.mjs bwSSActivePred "rem")
        else if (rel.type === "PR_SS") { v = t.status === "TK_Active" ? b.ls : lc.subWork(b.ls, rel.lag); fin = false; }
        else if (rel.type === "PR_FF") { v = lc.subWork(b.lf, rel.lag); fin = true; }
        else { v = lc.subWork(b.lf, rel.lag); fin = false; }
        if (fin && v < fMin) { fMin = v; fVia = rel; }
        if (!fin && v < sMin) { sMin = v; sVia = rel; }
      }
      let lf, ls, via;
      if (t.type === "TT_FinMile" || t.type === "TT_Mile" || remain === 0) {
        const v = Math.min(fMin, sMin);
        via = fMin <= sMin ? fVia : sVia;
        ls = lf = t.type === "TT_Mile" ? (cal.nextStart(v) === v ? v : cal.prevEnd(v)) : cal.prevEnd(v);
      } else {
        lf = Number.isFinite(fMin) ? cal.prevEnd(fMin) : Infinity; via = fVia;
        if (Number.isFinite(sMin)) {
          const st = cal.nextStart(sMin) === sMin ? sMin : cal.prevEnd(sMin);
          const viaStart = cal.addWork(st, remain);
          if (viaStart < lf) { lf = viaStart; via = sVia; }
        }
        ls = cal.nextStart(cal.subWork(lf, remain));
      }
      bound.set(id, { lf, ls, via });
    }
    for (const rel of t.preds) {
      if (!cone.has(rel.predId) || rel.predId === id) continue;
      outdeg.set(rel.predId, outdeg.get(rel.predId) - 1);
      if (outdeg.get(rel.predId) === 0) queue.push(rel.predId);
    }
  }
  return bound; // activities on or behind a loop are left out
}

// Float of an activity against a bound, in hours on its own calendar, by
// the project's float type (finish, start or the smaller).
export function floatAgainst(result, id, b) {
  const { model, tasks: res } = result;
  const t = model.tasks.get(id), r = res.get(id);
  const ft = model.projects.get(t.proj)?.floatType || "FT_FF";
  const fin = t.cal.workBetween(r.ef, b.lf), st = t.cal.workBetween(r.remES ?? r.es, b.ls);
  return (ft === "FT_SF" ? st : ft === "FT_FF" ? fin : Math.min(st, fin)) / 60;
}

export function floatPaths(result, targetId, { count = 10 } = {}) {
  const { model, tasks: res } = result;
  const target = model.tasks.get(targetId);
  if (!target || !open(target) || !res.get(targetId)) return { target: null, paths: [], unreached: 0 };
  const bound = targetBound(result, targetId, res.get(targetId).ef);
  const rf = new Map();
  for (const [id, b] of bound) rf.set(id, Math.round(floatAgainst(result, id, b) * 1e4) / 1e4);
  const ef = (id) => res.get(id).ef;
  const order = [...rf.keys()].sort((a, b) => rf.get(a) - rf.get(b) || ef(b) - ef(a));
  const assigned = new Set();
  const paths = [];
  const rel2 = (rel) => rel.type.replace("PR_", "");
  const row = (id) => {
    const t = model.tasks.get(id), r = res.get(id), link = bound.get(id)?.via;
    return { id, code: t.code, name: t.name, start: formatDate(r.remES ?? r.es), finish: formatDate(r.ef), tf: r.tf, rf: rf.get(id), link: link ? { to: model.tasks.get(link.succId).code, type: rel2(link), lag: link.lag / 60, float: Math.max(0, relationshipFloat(result, link)) / 60 } : null };
  };
  for (const seed of order) {
    if (paths.length >= count) break;
    if (assigned.has(seed)) continue;
    const chain = [];
    let cur = seed;
    while (cur !== undefined && !assigned.has(cur)) {
      assigned.add(cur);
      chain.push(cur);
      // the predecessor whose target-bound date this one sets, the least
      // relative float first, then the latest finish
      let next, nf = Infinity, ne = -Infinity;
      for (const rel of model.tasks.get(cur).preds) {
        const b = bound.get(rel.predId);
        if (!b || assigned.has(rel.predId) || b.via !== rel) continue;
        // a path keeps to its own float: a predecessor with more relative
        // float (behind a constraint, an out-of-sequence link) starts a later path
        if (rf.get(rel.predId) - rf.get(cur) > 0.01) continue;
        const f = rf.get(rel.predId), e = ef(rel.predId);
        if (f < nf || (f === nf && e > ne)) { next = rel.predId; nf = f; ne = e; }
      }
      cur = next;
    }
    paths.push({ n: paths.length + 1, float: rf.get(seed), activities: chain.reverse().map(row) });
  }
  return { target: row(targetId), paths, unreached: rf.size - assigned.size, bound };
}

export function floatPathsCsv(fp) {
  // a cell a spreadsheet would run as a formula (an activity name from the
  // contractor's file starting with =, +, - or @) is written as text
  const q = (v) => {
    if (v === null || v === undefined) return "";
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [["path", "path float (h)", "activity", "name", "start", "finish", "relative float (h)", "total float (h)", "link to next", "link float (h)"].join(",")];
  for (const p of fp.paths) for (const a of p.activities) {
    lines.push([p.n, p.float.toFixed(2), a.code, a.name, a.start, a.finish, a.rf.toFixed(2), a.tf === undefined ? "" : a.tf.toFixed(2), a.link ? `${a.link.type}${a.link.lag ? ` ${a.link.lag} h` : ""}` : "", a.link ? a.link.float.toFixed(2) : ""].map(q).join(","));
  }
  return lines.join("\n") + "\n";
}
