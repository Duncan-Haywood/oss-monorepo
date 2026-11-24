// The windows analysis (windows.mjs) on kinds of change the first check
// (eval/windows-check.mjs, 2026-11-19) never planted. That check planted three:
// a remaining-duration slip, a lag and a re-estimated duration, all of them
// delays. A real job's updates also hold late starts, gains (work going faster
// than forecast, early finishes), constraints, inserted activities, deleted or
// retyped links, calendar swaps and duration cuts, and a reviewer needs those
// on the right side of the split and named as much as the delays.
//
// Each real file is the first update of a series this script makes: statused
// as planned (status.mjs) every 20 working days of the project calendar, with
// one kind of change planted in each window on the driving path at the start
// of that window:
//
//   progress side (revisions must be 0):
//     late-start   an unstarted activity forecast to start in the window is
//                  left unstarted (its successors had not started either)
//     gain         work under way has G fewer days left than forecast
//     early-finish work under way forecast to finish after the window ends
//                  is complete at the data date
//   revision side (progress must be 0):
//     constraint   a start-on-or-after constraint C days after the early start
//     added        a new C-day activity inserted into an FS link
//     link-deleted a driving FS link deleted where the successor has another
//                  predecessor (no open end made)
//     calendar     an unstarted activity moved to another calendar of the file
//     cut          an unstarted activity's original and remaining duration
//                  cut by C days
//     type         a driving FS link retyped SS
//
// Expected split from counterfactual files, as in windows-check.mjs: the
// progress effect is the finish of the window's file built with its progress
// and without its revision, against the previous update; the revision effect
// is the rest. Checked per planted window: the split equals that, the other
// side is 0, and the planted activity or link is among the window's drivers.
//
//   node eval/windows-kinds-check.mjs <dir-with-xer-files> [--seeds 3] [--json out.json] [--only file.xer] [--out-of-sequence] [--mixed N]
//
// --mixed N (N = 2 or 3): several kinds in one window, as a real update holds.
// Each window plants one progress kind and N-1 revision kinds, chained: the
// progress change on the as-planned statused file, then each revision on the
// file the one before it made (so a revision is picked on the half-step
// driving path, the one this period's progress left). Expected split as
// above: the progress effect is the window's file with its progress and none
// of its revisions; the revisions are the rest. Checked per window: the split
// is exact, and every planted change is named among the drivers on its own
// side (a change named only on the other side is counted as such).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseXer, decodeXer, formatDate, num } from "../xer.mjs";
import { schedule, drivingPath } from "../cpm.mjs";
import { pickProject, compare } from "../compare.mjs";
import { statusAsPlanned, cloneXer } from "../status.mjs";
import { windows } from "../windows.mjs";

const args = process.argv.slice(2);
const dir = args[0];
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const SEEDS = +opt("--seeds", 3);
const ONLY = opt("--only", null);
// --out-of-sequence: let early-finish plant on out-of-sequence work too (the
// first run's seeding, kept to re-check the CCA seed 1 window 7 case)
const OOS = args.includes("--out-of-sequence");
const MIXED = args.includes("--mixed") ? +opt("--mixed", 2) : 0;
const STEP_DAYS = 20;
export const KINDS = ["late-start", "gain", "early-finish", "constraint", "added", "link-deleted", "calendar", "cut", "type"];
const PROGRESS_KINDS = new Set(["late-start", "gain", "early-finish"]);

function rng(seed) {
  let x = (seed * 2654435761) >>> 0 || 1;
  return () => ((x ^= x << 13, x ^= x >>> 17, x ^= x << 5) >>> 0) / 4294967296;
}

const isMile = (t) => t.type === "TT_Mile" || t.type === "TT_FinMile";

// the open driving path of xer, as task objects, with the schedule result
function pathOf(xer, projId) {
  const res = schedule(xer);
  const p = res.projects.get(projId);
  return { res, p, path: drivingPath(res, projId).map((id) => res.model.tasks.get(id)) };
}

// driving FS links pred -> succ on the path (drivingPath runs start-first), one link
// between the pair, predecessor on the project calendar
function pathLinks(res, p, path, test) {
  const out = [];
  for (let i = 0; i + 1 < path.length; i++) {
    const pr = path[i], s = path[i + 1];
    const rel = s.preds.find((r) => r.predId === pr.id && r.type === "PR_FS");
    if (!rel) continue;
    if (res.model.rels.filter((r) => r.predId === pr.id && r.succId === s.id).length !== 1) continue;
    if (test && !test(pr, s, rel)) continue;
    out.push({ relId: rel.id, pred: pr, succ: s, rel });
  }
  return out;
}

const taskRow = (x, code, projId) => x.tables.TASK.find((r) => r.task_code === code && r.proj_id === projId);

// Each planter takes (prev = the update at the start of the window, statused =
// it statused as planned to dd, projId, dd, rand, hpd) and returns null (no
// candidate) or { full, progOnly, target, nominal } where target is the code
// the window's drivers should name.
const planters = {
  "late-start"(prev, st, projId, dd, rand) {
    const { res, path } = pathOf(prev, projId);
    const after = schedule(st);
    const cands = path.filter((t) => {
      if (t.status !== "TK_NotStart" || isMile(t) || t.span) return false;
      const r = res.tasks.get(t.id);
      if (!((r.remES ?? r.es) < dd && r.ef > dd)) return false;
      // nothing after it has started by dd in the as-planned update
      return t.succs.every((rel) => after.model.tasks.get(rel.succId)?.status === "TK_NotStart");
    });
    if (!cands.length) return null;
    const t = cands[Math.floor(rand() * cands.length)];
    const x = cloneXer(st);
    const row = taskRow(x, t.code, projId), was = taskRow(prev, t.code, projId);
    row.status_code = "TK_NotStart";
    row.act_start_date = "";
    row.act_end_date = "";
    row.remain_drtn_hr_cnt = was.remain_drtn_hr_cnt;
    for (const f of ["act_work_qty", "act_equip_qty", "phys_complete_pct", "remain_work_qty", "remain_equip_qty"]) if (f in row) row[f] = was[f];
    return { full: x, progOnly: x, target: t.code, detail: `${t.code} left unstarted` };
  },
  gain(prev, st, projId, dd, rand, hpd) {
    const after = pathOf(st, projId);
    // not work with an expected finish date: P6 (and cpm.mjs) recompute its
    // remaining duration from that date, so a cut there is no gain at all
    // (7 of 21 --mixed gains on 2026-11-24 were such, all split 0 and unnamed)
    const cands = after.path.filter((t) => t.status === "TK_Active" && t.remain >= 2 * hpd * 60 && !t.expEnd);
    if (!cands.length) return null;
    const t = cands[Math.floor(rand() * cands.length)];
    const maxG = Math.floor(t.remain / 60 / hpd) - 1;
    const G = 1 + Math.floor(rand() * Math.min(5, maxG));
    const x = cloneXer(st);
    const row = taskRow(x, t.code, projId);
    row.remain_drtn_hr_cnt = String((num(row.remain_drtn_hr_cnt) ?? 0) - G * hpd);
    return { full: x, progOnly: x, target: t.code, nominal: -G, detail: `${t.code} ${G} days less left` };
  },
  "early-finish"(prev, st, projId, dd, rand) {
    const after = pathOf(st, projId);
    // in sequence only: every predecessor complete. Finishing out-of-sequence
    // work (started before its FS predecessor finished, as CCA's TEXCO04405C0)
    // keeps its node behind that predecessor and can move the finish later
    // (+19.4 days on the 2026-11-24 first run): a seeding artefact, not a gain
    const cands = after.path.filter((t) => t.status === "TK_Active" && t.remain > 0 && (OOS || t.preds.every((r) => { const q = after.res.model.tasks.get(r.predId); return !q || q.span || q.status === "TK_Complete"; })));
    if (!cands.length) return null;
    const t = cands[Math.floor(rand() * cands.length)];
    const x = cloneXer(st);
    const row = taskRow(x, t.code, projId);
    row.status_code = "TK_Complete";
    row.act_end_date = formatDate(dd);
    row.remain_drtn_hr_cnt = "0";
    for (const [a, r] of [["act_work_qty", "remain_work_qty"], ["act_equip_qty", "remain_equip_qty"]]) if (r in row) { row[a] = String((num(row[a]) ?? 0) + (num(row[r]) ?? 0)); row[r] = "0"; }
    if ("phys_complete_pct" in row) row.phys_complete_pct = "100";
    return { full: x, progOnly: x, target: t.code, detail: `${t.code} finished at the data date` };
  },
  constraint(prev, st, projId, dd, rand, hpd) {
    const { res, p, path } = pathOf(st, projId);
    const cands = path.filter((t) => t.status === "TK_NotStart" && !t.span && t.cstr.length === 0 && t.cal === p.cal && (res.tasks.get(t.id).remES ?? res.tasks.get(t.id).es) > dd);
    if (!cands.length) return null;
    const t = cands[Math.floor(rand() * cands.length)];
    const C = 1 + Math.floor(rand() * 5);
    const r = res.tasks.get(t.id);
    const x = cloneXer(st);
    const row = taskRow(x, t.code, projId);
    row.cstr_type = "CS_MSOA";
    row.cstr_date = formatDate(p.cal.addWork(r.remES ?? r.es, C * hpd * 60));
    return { full: x, progOnly: st, target: t.code, nominal: C, detail: `${t.code} start on or after +${C}` };
  },
  added(prev, st, projId, dd, rand, hpd) {
    const { res, p, path } = pathOf(st, projId);
    const links = pathLinks(res, p, path, (pr, s) => pr.status === "TK_NotStart" && pr.cal === p.cal);
    if (!links.length) return null;
    const L = links[Math.floor(rand() * links.length)];
    const C = 1 + Math.floor(rand() * 5);
    const x = cloneXer(st);
    const proto = taskRow(x, L.pred.code, projId);
    const ids = x.tables.TASK.map((r) => +r.task_id).filter(Number.isFinite);
    const newId = String(Math.max(...ids) + 1);
    const code = `ZZ-ADDED-${newId}`;
    const nt = { ...proto, task_id: newId, task_code: code, task_name: "Inserted activity (planted)", task_type: "TT_Task", status_code: "TK_NotStart", act_start_date: "", act_end_date: "", target_drtn_hr_cnt: String(C * hpd), remain_drtn_hr_cnt: String(C * hpd), cstr_type: "", cstr_date: "", cstr_type2: "", cstr_date2: "" };
    if ("guid" in nt) nt.guid = "";
    x.tables.TASK.push(nt);
    const relRow = x.tables.TASKPRED.find((r) => r.task_pred_id === L.relId);
    const rids = x.tables.TASKPRED.map((r) => +r.task_pred_id).filter(Number.isFinite);
    let next = Math.max(...rids) + 1;
    // pred -> new (FS, the old lag), new -> succ (FS, 0)
    x.tables.TASKPRED.push({ ...relRow, task_pred_id: String(next++), task_id: newId, pred_task_id: relRow.pred_task_id, proj_id: projId });
    relRow.pred_task_id = newId;
    relRow.pred_proj_id = projId;
    relRow.lag_hr_cnt = "0";
    // the old link pred -> succ is gone; its row now carries new -> succ
    return { full: x, progOnly: st, target: code, nominal: C, detail: `${code} (${C} d) between ${L.pred.code} and ${L.succ.code}` };
  },
  "link-deleted"(prev, st, projId, dd, rand) {
    const { res, p, path } = pathOf(st, projId);
    const links = pathLinks(res, p, path, (pr, s) => pr.status !== "TK_Complete" && s.status === "TK_NotStart" && s.preds.filter((r) => r.predId !== pr.id).length > 0 && pr.succs.filter((r) => r.succId !== s.id).length > 0);
    if (!links.length) return null;
    const L = links[Math.floor(rand() * links.length)];
    const x = cloneXer(st);
    x.tables.TASKPRED = x.tables.TASKPRED.filter((r) => r.task_pred_id !== L.relId);
    return { full: x, progOnly: st, target: `${L.pred.code} -> ${L.succ.code}`, detail: `FS ${L.pred.code} -> ${L.succ.code} deleted` };
  },
  calendar(prev, st, projId, dd, rand) {
    const { res, p, path } = pathOf(st, projId);
    const cals = [...new Set([...res.model.tasks.values()].map((t) => t.cal))];
    const cands = path.filter((t) => t.status === "TK_NotStart" && !t.span && !isMile(t) && t.orig > 0);
    if (!cands.length || cals.length < 2) return null;
    // the first candidate (random order) whose move to another calendar changes its finish
    const order = cands.map((t) => [rand(), t]).sort((a, b) => a[0] - b[0]).map((a) => a[1]);
    for (const t of order) {
      const others = cals.filter((c) => c !== t.cal && c.id);
      for (const c of others.map((c) => [rand(), c]).sort((a, b) => a[0] - b[0]).map((a) => a[1])) {
        const x = cloneXer(st);
        taskRow(x, t.code, projId).clndr_id = c.id;
        const f0 = res.projects.get(projId).finish, f1 = schedule(x).projects.get(projId).finish;
        if (f1 !== f0) return { full: x, progOnly: st, target: t.code, detail: `${t.code} calendar ${t.cal.name || t.cal.id} -> ${c.name || c.id}` };
      }
    }
    return null;
  },
  cut(prev, st, projId, dd, rand, hpd) {
    const { res, p, path } = pathOf(st, projId);
    const cands = path.filter((t) => t.status === "TK_NotStart" && !t.span && !isMile(t) && t.orig >= 2 * hpd * 60 && t.remain === t.orig);
    if (!cands.length) return null;
    const t = cands[Math.floor(rand() * cands.length)];
    const C = 1 + Math.floor(rand() * Math.min(5, Math.floor(t.orig / 60 / (t.cal.hoursPerDay || 8)) - 1));
    const h = C * (t.cal.hoursPerDay || 8);
    const x = cloneXer(st);
    const row = taskRow(x, t.code, projId);
    for (const f of ["target_drtn_hr_cnt", "remain_drtn_hr_cnt"]) row[f] = String((num(row[f]) ?? 0) - h);
    return { full: x, progOnly: st, target: t.code, nominal: -C, detail: `${t.code} cut ${C} d` };
  },
  type(prev, st, projId, dd, rand) {
    const { res, p, path } = pathOf(st, projId);
    const links = pathLinks(res, p, path, (pr, s) => pr.status === "TK_NotStart" && s.status === "TK_NotStart" && !isMile(pr));
    if (!links.length) return null;
    const L = links[Math.floor(rand() * links.length)];
    const x = cloneXer(st);
    x.tables.TASKPRED.find((r) => r.task_pred_id === L.relId).pred_type = "PR_SS";
    return { full: x, progOnly: st, target: `${L.pred.code} -> ${L.succ.code}`, detail: `FS -> SS ${L.pred.code} -> ${L.succ.code}` };
  },
};

function runFile(path, seed) {
  const xer = parseXer(decodeXer(readFileSync(path)));
  const res0 = schedule(xer);
  const projId = pickProject(xer, res0.model, null).id;
  const p = res0.projects.get(projId);
  const hpd = p.cal.hoursPerDay || 8;
  const rand = rng(seed * 7919 + 17);
  const step = (dd) => p.cal.addWork(dd, STEP_DAYS * hpd * 60);
  const finOf = (x) => { const r = schedule(x); const q = r.projects.get(projId); return { f: q.finish, cal: q.cal }; };
  const wdays = (a, b, cal) => Math.round((cal.workBetween(a, b) / 60 / (cal.hoursPerDay || 8)) * 10) / 10;
  const effect = (prev, progOnly, full) => { const a = finOf(prev), b = finOf(progOnly), c = finOf(full); return { progress: wdays(a.f, b.f, c.cal), revisions: Math.round((wdays(a.f, c.f, c.cal) - wdays(a.f, b.f, c.cal)) * 10) / 10 }; };
  const u = [xer], plan = [];
  let dd = p.dataDate;
  // the kinds in a seed-shuffled order, so each kind meets the schedule at several stages
  const kinds = KINDS.map((k) => [rand(), k]).sort((a, b) => a[0] - b[0]).map((a) => a[1]);
  for (const kind of kinds) {
    dd = step(dd);
    const prev = u[u.length - 1];
    const st = statusAsPlanned(prev, projId, dd);
    let pl = null;
    try { pl = planters[kind](prev, st, projId, dd, rand, hpd); } catch (e) { pl = { error: e.message }; }
    if (!pl || pl.error) { u.push(st); plan.push({ kind, planted: false, error: pl?.error, ...effect(prev, st, st) }); continue; }
    u.push(pl.full);
    plan.push({ kind, planted: true, target: pl.target, detail: pl.detail, nominal: pl.nominal ?? null, ...effect(prev, pl.progOnly, pl.full) });
  }
  const t0 = Date.now();
  const order = u.map((x, i) => ({ xer: x, label: `U${i}` })).sort(() => rand() - 0.5);
  const rep = windows(order);
  const ms = Date.now() - t0;
  const rows = rep.windows.map((w, i) => {
    const e = plan[i];
    const prog = PROGRESS_KINDS.has(e.kind);
    const list = prog ? w.drivers.progress : w.drivers.revisions;
    const row = { window: w.n, kind: e.kind, planted: e.planted, detail: e.detail || null, error: e.error || null, expect: { progress: e.progress, revisions: e.revisions, nominal: e.nominal }, got: { moved: w.moved, progress: w.progressEffect, revisions: w.revisionEffect } };
    row.splitExact = w.progressEffect === e.progress && w.revisionEffect === e.revisions;
    row.side = prog ? w.revisionEffect === 0 : w.progressEffect === 0;
    row.moved = (prog ? e.progress : e.revisions) !== 0;
    row.named = e.planted ? list.some((d) => d.code === e.target) : null;
    if (e.planted && !row.named) row.namedOtherSide = (prog ? w.drivers.revisions : w.drivers.progress).some((d) => d.code === e.target);
    return row;
  });
  return { file: path.split("/").pop(), seed, ordered: rep.updates.map((x) => x.label).join(",") === u.map((_, i) => `U${i}`).join(","), rows, total: rep.total, addsUp: rep.total.moved === rep.total.sumOfWindows, ms };
}

// --mixed: one progress kind and MIXED-1 revision kinds per window
function runFileMixed(path, seed) {
  const xer = parseXer(decodeXer(readFileSync(path)));
  const res0 = schedule(xer);
  const projId = pickProject(xer, res0.model, null).id;
  const p = res0.projects.get(projId);
  const hpd = p.cal.hoursPerDay || 8;
  const rand = rng(seed * 104729 + 31);
  const step = (dd) => p.cal.addWork(dd, STEP_DAYS * hpd * 60);
  const finOf = (x) => { const q = schedule(x).projects.get(projId); return { f: q.finish, cal: q.cal }; };
  const wdays = (a, b, cal) => Math.round((cal.workBetween(a, b) / 60 / (cal.hoursPerDay || 8)) * 10) / 10;
  const effect = (prev, progOnly, full) => { const a = finOf(prev), b = finOf(progOnly), c = finOf(full); return { progress: wdays(a.f, b.f, c.cal), revisions: Math.round((wdays(a.f, c.f, c.cal) - wdays(a.f, b.f, c.cal)) * 10) / 10 }; };
  const shuffle = (xs) => xs.map((k) => [rand(), k]).sort((a, b) => a[0] - b[0]).map((a) => a[1]);
  const progKinds = KINDS.filter((k) => PROGRESS_KINDS.has(k)), revKinds = KINDS.filter((k) => !PROGRESS_KINDS.has(k));
  const u = [xer], plan = [];
  let dd = p.dataDate;
  // 6 windows, each kind of revision leading once; the progress kind cycles
  const lead = shuffle(revKinds);
  for (let wi = 0; wi < lead.length; wi++) {
    dd = step(dd);
    const prev = u[u.length - 1];
    const st = statusAsPlanned(prev, projId, dd);
    const want = [progKinds[(wi + seed) % progKinds.length], lead[wi], ...shuffle(revKinds.filter((k) => k !== lead[wi])).slice(0, MIXED - 2)];
    let cur = st, progOnly = st;
    const planted = [];
    for (const kind of want) {
      let pl = null;
      try { pl = planters[kind](prev, cur, projId, dd, rand, hpd); } catch (e) { pl = { error: e.message }; }
      if (!pl || pl.error) { planted.push({ kind, planted: false, error: pl?.error || null }); continue; }
      // a revision planted on an earlier revision's target would blur whose effect is whose
      if (planted.some((q) => q.planted && q.target === pl.target)) { planted.push({ kind, planted: false, error: "same target" }); continue; }
      cur = pl.full;
      if (PROGRESS_KINDS.has(kind)) progOnly = cur;
      planted.push({ kind, planted: true, target: pl.target, detail: pl.detail });
    }
    u.push(cur);
    plan.push({ planted, ...effect(prev, progOnly, cur) });
  }
  const t0 = Date.now();
  const rep = windows(u.map((x, i) => ({ xer: x, label: `U${i}` })).sort(() => rand() - 0.5));
  const ms = Date.now() - t0;
  const rows = rep.windows.map((w, i) => {
    const e = plan[i];
    const kinds = e.planted.map((q) => {
      const prog = PROGRESS_KINDS.has(q.kind);
      if (!q.planted) return { ...q, side: prog ? "progress" : "revisions" };
      const mine = prog ? w.drivers.progress : w.drivers.revisions, other = prog ? w.drivers.revisions : w.drivers.progress;
      const named = mine.some((d) => d.code === q.target);
      return { ...q, side: prog ? "progress" : "revisions", named, namedOtherSide: !named && other.some((d) => d.code === q.target) };
    });
    const n = kinds.filter((q) => q.planted).length;
    return { window: w.n, kinds, plantedCount: n, both: kinds.some((q) => q.planted && q.side === "progress") && kinds.some((q) => q.planted && q.side === "revisions"), expect: { progress: e.progress, revisions: e.revisions }, got: { moved: w.moved, progress: w.progressEffect, revisions: w.revisionEffect }, splitExact: w.progressEffect === e.progress && w.revisionEffect === e.revisions };
  });
  // DEBUG_MIXED=1: why a planted change went unnamed (path membership, float row, progress lists)
  if (process.env.DEBUG_MIXED) for (const x of rows) for (const q of x.kinds) if (q.planted && !q.named) {
    const c = compare(u[x.window - 1], u[x.window], {});
    const fr = c.float.rows.find((r) => r.code === q.target);
    console.log("DEBUG", x.window, q.kind, q.target, "onPrev", c.criticalPath.previous.includes(q.target), "onCur", c.criticalPath.current.includes(q.target), JSON.stringify(fr), "prog", JSON.stringify(Object.fromEntries(Object.entries(c.progress).map(([k, v]) => [k, Array.isArray(v) ? v.filter((r) => r.code === q.target).length : v]))));
  }
  return { file: path.split("/").pop(), seed, mixed: MIXED, ordered: rep.updates.map((x) => x.label).join(",") === u.map((_, i) => `U${i}`).join(","), rows, total: rep.total, addsUp: rep.total.moved === rep.total.sumOfWindows, ms };
}

if (MIXED) {
  const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".xer") && (!ONLY || f === ONLY)).sort();
  const all = [];
  for (const f of files) for (let s = 1; s <= SEEDS; s++) {
    let r;
    try { r = runFileMixed(join(dir, f), s); } catch (e) { r = { file: f, seed: s, error: e.stack }; }
    all.push(r);
    if (r.error) { console.log(`${f} seed ${s}: ERROR ${r.error}`); continue; }
    const ws = r.rows.filter((x) => x.both);
    const ch = r.rows.flatMap((x) => x.kinds).filter((q) => q.planted);
    console.log(`${f} seed ${s}: windows with both sides ${ws.length}/${r.rows.length}, changes planted ${ch.length}, split exact ${r.rows.filter((x) => x.plantedCount && x.splitExact).length}/${r.rows.filter((x) => x.plantedCount).length}, named ${ch.filter((q) => q.named).length}/${ch.length}, adds up ${r.addsUp}, sorted ${r.ordered}, ${r.ms} ms`);
    for (const x of r.rows) {
      const miss = x.kinds.filter((q) => q.planted && !q.named);
      if (x.plantedCount && (!x.splitExact || miss.length)) console.log(`   W${x.window} [${x.kinds.filter((q) => q.planted).map((q) => q.detail).join("; ")}] expect ${JSON.stringify(x.expect)} got ${JSON.stringify(x.got)}${miss.length ? " not named: " + miss.map((q) => q.kind + (q.namedOtherSide ? " (other side)" : "")).join(", ") : ""}`);
    }
  }
  const ok = all.filter((r) => !r.error);
  const ch = ok.flatMap((r) => r.rows.flatMap((x) => x.kinds)).filter((q) => q.planted);
  const both = ok.flatMap((r) => r.rows).filter((x) => x.both);
  console.log("\nkind          planted  named  other-side");
  for (const k of KINDS) { const rs = ch.filter((q) => q.kind === k); console.log(`${k.padEnd(13)} ${String(rs.length).padStart(7)} ${String(rs.filter((q) => q.named).length).padStart(6)} ${String(rs.filter((q) => q.namedOtherSide).length).padStart(11)}`); }
  const planted = ok.flatMap((r) => r.rows).filter((x) => x.plantedCount);
  console.log(`windows with a plant ${planted.length}, split exact ${planted.filter((x) => x.splitExact).length}; with both sides ${both.length}, split exact ${both.filter((x) => x.splitExact).length}, both sides moved ${both.filter((x) => x.expect.progress !== 0 && x.expect.revisions !== 0).length}`);
  console.log(`series ${ok.length}, adding up ${ok.filter((r) => r.addsUp).length}, sorted ${ok.filter((r) => r.ordered).length}, errors ${all.length - ok.length}`);
  if (args.includes("--json")) writeFileSync(opt("--json"), JSON.stringify(all, null, 1) + "\n");
  process.exit(0);
}

const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".xer") && (!ONLY || f === ONLY)).sort();
const all = [];
for (const f of files) {
  for (let s = 1; s <= SEEDS; s++) {
    let r;
    try { r = runFile(join(dir, f), s); } catch (e) { r = { file: f, seed: s, error: e.stack }; }
    all.push(r);
    if (r.error) { console.log(`${f} seed ${s}: ERROR ${r.error}`); continue; }
    const pl = r.rows.filter((x) => x.planted);
    const bad = pl.filter((x) => !x.splitExact || !x.side || !x.named);
    console.log(`${f} seed ${s}: planted ${pl.length}/9, split exact ${pl.filter((x) => x.splitExact).length}, side ${pl.filter((x) => x.side).length}, named ${pl.filter((x) => x.named).length}, adds up ${r.addsUp}, sorted ${r.ordered}, ${r.ms} ms`);
    for (const b of bad) console.log(`   W${b.window} ${b.kind}: ${b.detail}; expect ${JSON.stringify(b.expect)} got ${JSON.stringify(b.got)} named ${b.named}${b.namedOtherSide ? " (on the other side)" : ""}`);
  }
}
const ok = all.filter((r) => !r.error);
console.log("\nkind          planted  moved  split-exact  right-side  named");
for (const k of KINDS) {
  const rs = ok.flatMap((r) => r.rows).filter((x) => x.kind === k && x.planted);
  console.log(`${k.padEnd(13)} ${String(rs.length).padStart(7)} ${String(rs.filter((x) => x.moved).length).padStart(6)} ${String(rs.filter((x) => x.splitExact).length).padStart(12)} ${String(rs.filter((x) => x.side).length).padStart(11)} ${String(rs.filter((x) => x.named).length).padStart(6)}`);
}
console.log(`series ${ok.length}, adding up ${ok.filter((r) => r.addsUp).length}, sorted ${ok.filter((r) => r.ordered).length}, errors ${all.length - ok.length}`);
if (args.includes("--json")) writeFileSync(opt("--json"), JSON.stringify(all, null, 1) + "\n");
