// Redundant logic: relationships another path in the network already
// implies, so they can never drive their successor whatever the durations
// become. Deleting them leaves every date the schedule can ever compute
// unchanged, and leaves a network a reviewer can read.
//
// Why it matters: schedule review tools (Deltek Acumen Fuse's "redundant
// logic" metric, and the reviewers who use it) flag these links because
// they inflate the logic count a DCMA or GAO reviewer reads as "well
// linked", they clutter a trace of the driving path, and an update that
// deletes the activity carrying the real logic leaves the redundant link
// behind as an untested tie. P6 and Microsoft Project do not report them.
//
// The test, for any non-negative durations: each activity X is two events,
// its start S_X and finish F_X, with F_X >= S_X (a remaining duration can
// shrink to zero, never below). Each relationship is a lower bound between
// two events with its lag:
//   FS: S_succ >= F_pred + lag     SS: S_succ >= S_pred + lag
//   FF: F_succ >= F_pred + lag     SF: F_succ >= S_pred + lag
// A link u -> v with lag w is redundant when some other path u -> ... -> v
// in that event graph has lags adding to at least w: the other path then
// pushes v at least as late as the link can, for every set of durations.
// Two links between the same pair in the same direction (a duplicate FS,
// say) are the shortest case.
//
// Lags are working hours on a calendar (cpm.mjs lagCalendar). Adding hours
// on one calendar and moving to the next working moment on another are both
// monotone, so the comparison is exact ("sure") when the link's lag is zero
// or a lead and every lag on the other path is zero or more, or when every
// non-zero lag involved sits on the same lag calendar. Otherwise the lags
// are compared as hours and the link is marked "check" (a 16 h lag on a
// 7-day calendar is not 16 h on a 5-day one).
//
// A link whose other path exists but carries less lag ("lag-carrying") is
// not redundant: its own lag is the only thing holding that gap. It is
// listed apart, because moving the lag onto the path, or confirming it, is
// a reviewer's call.
//
// Left out: links to or from level of effort and WBS summary activities
// (they span the network and drive nothing in cpm.mjs), links to an
// activity outside the file, links into a started or completed activity and
// links out of a completed one or an in-progress one's start (actual dates
// they can no longer move; counted, not listed), paths through a started
// activity, and activities on a logic loop (cpm.mjs reports loops).
//
// redundantLogic(xer, { model, projId, maxVisits }) -> {
//   links, redundant: [...], lagCarrying: [...], summary, warnings, ms
// }

import { buildModel, lagCalendar } from "./cpm.mjs";

export const MAX_VISITS = 5e7;
const TYPES = { PR_FS: ["F", "S"], PR_SS: ["S", "S"], PR_FF: ["F", "F"], PR_SF: ["S", "F"] };
const r1 = (x) => Math.round(x * 10) / 10;

export function redundantLogic(xer, { model: model0 = null, projId = null, maxVisits = MAX_VISITS } = {}) {
  const t0 = Date.now();
  const model = model0 || buildModel(xer);
  const warnings = [];
  // events: 2*i = start of activity i, 2*i+1 = its finish
  const acts = [...model.tasks.values()].filter((t) => !t.span);
  const index = new Map(acts.map((t, i) => [t.id, i]));
  const N = acts.length * 2;
  const out = Array.from({ length: N }, () => []); // [{ to, w, rel }]
  const inc = Array.from({ length: N }, () => []);
  const edge = (from, to, w, rel) => { const e = { from, to, w, rel }; out[from].push(e); inc[to].push(e); return e; };
  for (let i = 0; i < acts.length; i++) edge(2 * i, 2 * i + 1, 0, null);
  const linkEdges = [];
  let skippedSpan = 0, skippedExternal = 0, unknownType = 0;
  for (const rel of model.rels) {
    if (rel.external) { skippedExternal++; continue; }
    const p = index.get(rel.predId), s = index.get(rel.succId);
    if (p === undefined || s === undefined) { skippedSpan++; continue; }
    const ends = Object.hasOwn(TYPES, rel.type) ? TYPES[rel.type] : null;
    if (!ends) { unknownType++; continue; }
    const from = 2 * p + (ends[0] === "F" ? 1 : 0), to = 2 * s + (ends[1] === "F" ? 1 : 0);
    const le = edge(from, to, rel.lag, rel);
    le.n = linkEdges.length;
    linkEdges.push(le);
  }
  if (unknownType) warnings.push(`${unknownType} relationship${unknownType === 1 ? " has" : "s have"} a type other than FS, SS, FF or SF and ${unknownType === 1 ? "was" : "were"} left out`);

  // topological order of events (Kahn); events left over sit on a loop
  const indeg = new Int32Array(N);
  for (let v = 0; v < N; v++) indeg[v] = inc[v].length;
  const order = [];
  for (let v = 0; v < N; v++) if (!indeg[v]) order.push(v);
  for (let k = 0; k < order.length; k++) for (const e of out[order[k]]) if (--indeg[e.to] === 0) order.push(e.to);
  const pos = new Int32Array(N).fill(-1);
  order.forEach((v, k) => { pos[v] = k; });
  const onLoop = N - order.length;
  if (onLoop) warnings.push(`${new Set([...Array(N).keys()].filter((v) => pos[v] < 0).map((v) => v >> 1)).size} activities sit on or behind a logic loop and were left out of this check`);

  const taskOf = (v) => acts[v >> 1];
  const end = (v) => (v & 1 ? "finish" : "start");
  const done = (t) => t.status === "TK_Complete";
  const lagCalOf = (rel) => { try { return lagCalendar(model, rel); } catch { return null; } };

  // Progress: a started activity's start is an actual date, and a completed
  // one's dates are all actual, so logic no longer passes through them. A
  // path may leave from an in-progress activity's (forecast) finish, but it
  // never runs through a started activity, and links into one, or out of a
  // completed one or an in-progress one's start, are not candidates.
  const started = (t) => t.status === "TK_Complete" || t.status === "TK_Active" || t.actStart !== null;
  const bySource = new Map();
  let intoDone = 0, intoStarted = 0, fromProgress = 0;
  for (const e of linkEdges) {
    if (pos[e.from] < 0 || pos[e.to] < 0) continue;
    const st = taskOf(e.to);
    if (done(st)) { intoDone++; continue; }
    if (started(st)) { intoStarted++; continue; }
    const pt = taskOf(e.from);
    if (done(pt) || (started(pt) && !(e.from & 1))) { fromProgress++; continue; }
    if (!bySource.has(e.from)) bySource.set(e.from, []);
    bySource.get(e.from).push(e);
  }

  const full = new Float64Array(N).fill(-Infinity);
  const alt = new Float64Array(N).fill(-Infinity);
  const fullBy = new Array(N).fill(null), altBy = new Array(N).fill(null);
  const touched = [];
  let visits = 0, truncated = false;
  const redundant = [], lagCarrying = [];

  // min-heap of topological positions
  const heap = [];
  const push = (x) => { heap.push(x); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p] <= heap[i]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l] < heap[m]) m = l; if (r < heap.length && heap[r] < heap[m]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };

  const sources = [...bySource.keys()].sort((a, b) => pos[a] - pos[b]);
  for (const u of sources) {
    if (truncated) break;
    const cands = bySource.get(u);
    const targets = new Set(cands.map((e) => e.to));
    const limit = Math.max(...cands.map((e) => pos[e.to]));
    // longest paths from u, up to the furthest target in topological order;
    // at a target, alt[] ignores the edges straight from u (the candidates)
    full[u] = 0; touched.push(u);
    const queued = new Set([pos[u]]);
    heap.length = 0; push(pos[u]);
    while (heap.length) {
      const v = order[pop()];
      if (++visits > maxVisits) { truncated = true; break; }
      if (v !== u && targets.has(v)) {
        let best = -Infinity, by = null;
        for (const e of inc[v]) {
          if (e.from === u) continue;
          if (full[e.from] === -Infinity) continue;
          const d = full[e.from] + e.w;
          if (d > best) { best = d; by = e; }
        }
        alt[v] = best; altBy[v] = by;
        let f = best, fb = by;
        for (const e of inc[v]) if (e.from === u && e.w > f) { f = e.w; fb = e; }
        full[v] = f; fullBy[v] = fb;
      }
      for (const e of out[v]) {
        const p = pos[e.to];
        if (p > limit) continue;
        if (!targets.has(e.to) && started(taskOf(e.to))) continue;
        if (!targets.has(e.to)) {
          const d = full[v] + e.w;
          if (d > full[e.to]) { if (full[e.to] === -Infinity) touched.push(e.to); full[e.to] = d; fullBy[e.to] = e; }
        } else if (full[e.to] === -Infinity) touched.push(e.to);
        if (!queued.has(p)) { queued.add(p); push(p); }
      }
    }
    if (truncated) break;
    for (const e of cands) {
      // the best other route: a path through the network, or a parallel link
      let best = alt[e.to], by = altBy[e.to], parallel = null;
      // of two or more parallel links, the one with the most lag (the first
      // listed, on a tie) is kept unless the network implies it too, so
      // deleting every link named here never deletes them all
      for (const f of inc[e.to]) {
        if (f === e || f.from !== u) continue;
        const beats = f.w > e.w || (f.w === e.w && f.n < e.n);
        if (beats && f.w > best) { best = f.w; by = f; parallel = f; }
      }
      if (best === -Infinity) continue;
      // the other path's edges, from u to e.to
      const path = [];
      if (parallel) path.push(parallel);
      else {
        path.unshift(by);
        let x = by.from;
        while (x !== u) { const pe = fullBy[x]; if (!pe) break; path.unshift(pe); x = pe.from; }
      }
      const item = describe(e, path, best);
      if (best >= e.w) redundant.push(item); else lagCarrying.push(item);
    }
    for (const v of touched) { full[v] = -Infinity; alt[v] = -Infinity; fullBy[v] = null; altBy[v] = null; }
    touched.length = 0;
  }
  if (truncated) warnings.push(`stopped after ${maxVisits.toLocaleString("en-US")} event visits: the lists cover the links checked so far`);

  function describe(e, path, best) {
    const rel = e.rel, pred = model.tasks.get(rel.predId), succ = model.tasks.get(rel.succId);
    const lags = path.filter((x) => x.rel && x.w !== 0);
    let sure = (e.w <= 0 && path.every((x) => x.w >= 0));
    if (!sure) {
      const cals = new Set([...lags.map((x) => lagCalOf(x.rel)), ...(e.w !== 0 ? [lagCalOf(rel)] : [])]);
      sure = cals.size <= 1 && !cals.has(null);
    }
    const via = [];
    for (const x of path) {
      if (!x.rel) continue; // an activity's own start to finish
      via.push({ id: x.rel.id, pred: model.tasks.get(x.rel.predId).code, succ: model.tasks.get(x.rel.succId).code, type: x.rel.type.replace("PR_", ""), lagHours: r1(x.w / 60) });
    }
    const parallel = path.length === 1 && path[0].rel && path[0].from === e.from && path[0].to === e.to;
    return {
      id: rel.id,
      pred: pred.code, predName: pred.name, succ: succ.code, succName: succ.name,
      proj: succ.proj,
      type: rel.type.replace("PR_", ""), lagHours: r1(e.w / 60),
      otherPathLagHours: r1(best / 60),
      kind: parallel ? "duplicate" : "implied",
      sure,
      from: `${pred.code} ${end(e.from)}`, to: `${succ.code} ${end(e.to)}`,
      via,
    };
  }

  const keep = (x) => !projId || x.proj === projId;
  const red = redundant.filter(keep), lc = lagCarrying.filter(keep);
  const order2 = (a, b) => (a.pred < b.pred ? -1 : a.pred > b.pred ? 1 : a.succ < b.succ ? -1 : a.succ > b.succ ? 1 : 0);
  red.sort(order2); lc.sort(order2);
  const checked = linkEdges.length - intoDone - intoStarted - fromProgress;
  return {
    links: linkEdges.length,
    redundant: red,
    lagCarrying: lc,
    summary: {
      checked,
      redundant: red.length,
      sure: red.filter((x) => x.sure).length,
      duplicates: red.filter((x) => x.kind === "duplicate").length,
      lagCarrying: lc.length,
      share: checked ? Math.round((1000 * red.length) / checked) / 10 : 0,
      intoDone, intoStarted, fromProgress, skippedSpan, skippedExternal, visits, truncated,
    },
    warnings,
    ms: Date.now() - t0,
  };
}

// The file with the given links (default: every "sure" redundant link)
// removed from TASKPRED, every other table and row untouched.
export function withoutLinks(xer, ids) {
  const drop = new Set(ids.map(String));
  return { ...xer, tables: { ...xer.tables, TASKPRED: (xer.tables.TASKPRED || []).filter((r) => !drop.has(String(r.task_pred_id))) } };
}

const pathText = (x) => x.via.map((v) => `${v.pred} ${v.type}${v.lagHours ? ` ${v.lagHours > 0 ? "+" : ""}${v.lagHours}h` : ""} ${v.succ}`).join(", ");

export function redundantText(r, { limit = 25 } = {}) {
  const s = r.summary;
  const L = [];
  L.push(`Redundant logic: ${s.redundant} of ${s.checked} open relationships are implied by another path (${s.share}%)${s.duplicates ? `, ${s.duplicates} of them duplicates` : ""}; ${s.sure} sure, ${s.redundant - s.sure} to check (lags on different calendars). ${s.lagCarrying} more ${s.lagCarrying === 1 ? "has" : "have"} another path but carry extra lag. (${r.ms} ms)`);
  if (r.redundant.length) {
    L.push("", "  link                                   other path");
    for (const x of r.redundant.slice(0, limit)) L.push(`  ${`${x.pred} ${x.type}${x.lagHours ? ` ${x.lagHours}h` : ""} ${x.succ}`.padEnd(38)} ${x.kind === "duplicate" ? "duplicate link" : pathText(x)}${x.sure ? "" : "  [check lag calendars]"}`);
    if (r.redundant.length > limit) L.push(`  ... ${r.redundant.length - limit} more (--json or --csv for all)`);
  }
  if (r.lagCarrying.length) {
    L.push("", "Another path exists, but this link's lag is longer (it holds the gap; keep it or move the lag):");
    for (const x of r.lagCarrying.slice(0, Math.min(limit, 10))) L.push(`  ${x.pred} ${x.type} ${x.lagHours}h ${x.succ}: other path ${x.otherPathLagHours}h via ${pathText(x)}`);
    if (r.lagCarrying.length > 10) L.push(`  ... ${r.lagCarrying.length - 10} more`);
  }
  if (r.warnings.length) L.push("", ...r.warnings.map((w) => `- ${w}`));
  L.push("", "Redundant: another chain of links pushes the successor at least as late as this link can, for any durations (each activity at least zero long). Deleting it changes no date.");
  return L.join("\n") + "\n";
}

const csvCell = (v) => {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function redundantCsv(r) {
  const rows = [["finding", "task_pred_id", "predecessor", "predecessor_name", "successor", "successor_name", "type", "lag_hours", "other_path_lag_hours", "sure", "other_path"]];
  for (const [kind, list] of [["redundant", r.redundant], ["lag-carrying", r.lagCarrying]]) for (const x of list) {
    rows.push([kind === "redundant" && x.kind === "duplicate" ? "duplicate" : kind, x.id, x.pred, x.predName, x.succ, x.succName, x.type, x.lagHours, x.otherPathLagHours, x.sure ? "yes" : "check", x.kind === "duplicate" ? "parallel link" : pathText(x)]);
  }
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
export function redundantTableHtml(r, { limit = 200 } = {}) {
  const s = r.summary;
  let h = `<p><strong>${s.redundant}</strong> of ${s.checked} open relationships (${s.share}%) are implied by another path${s.duplicates ? `, ${s.duplicates} of them duplicate links` : ""}: ${s.sure} sure, ${s.redundant - s.sure} to check because lags sit on different calendars. ${s.lagCarrying} more ${s.lagCarrying === 1 ? "has" : "have"} another path but carry extra lag.</p>`;
  if (r.redundant.length) {
    h += `<table><thead><tr><th>Link</th><th>Lag (h)</th><th>Other path</th><th>Sure?</th></tr></thead><tbody>`;
    for (const x of r.redundant.slice(0, limit)) h += `<tr><td>${esc(x.pred)} → ${esc(x.succ)} <small>${esc(x.type)}</small></td><td>${x.lagHours}</td><td>${x.kind === "duplicate" ? "duplicate link" : esc(pathText(x))}</td><td>${x.sure ? "yes" : "check lag calendars"}</td></tr>`;
    h += `</tbody></table>`;
    if (r.redundant.length > limit) h += `<p class="note">${r.redundant.length - limit} more in the CSV.</p>`;
  }
  return h;
}

// The XER text with the TASKPRED rows of the given task_pred_ids taken out
// and every other line left byte for byte as it was (header, line ends,
// quoting), so the file imports into P6 exactly as exported, less those
// links. Returns { text, removed }.
export function dropLinksText(text, ids) {
  const drop = new Set(ids.map(String));
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const out = [];
  let inPred = false, col = -1, removed = 0;
  for (const line of lines) {
    if (line.startsWith("%T")) { inPred = line.split("\t")[1]?.trim() === "TASKPRED"; col = -1; }
    else if (inPred && line.startsWith("%F")) col = line.split("\t").slice(1).indexOf("task_pred_id");
    else if (inPred && col >= 0 && line.startsWith("%R")) {
      if (drop.has(line.split("\t")[col + 1])) { removed++; continue; }
    }
    out.push(line);
  }
  return { text: out.join(eol), removed };
}
