// Does windows.mjs split a series of updates the right way, on real P6 files?
// No public series of real consecutive updates exists (eval/compare-check-*),
// so each real file is the first update of a series this script makes by
// statusing it as planned (status.mjs) four times, 20 working days apart, with
// known delays planted:
//
//   window 1: as planned, nothing planted          -> moved 0
//   window 2: progress slip of S days on an activity on the driving path that
//             is under way or due to finish in the window -> progress +S, revisions 0
//   window 3: a revision on the driving path, unstarted work: lag +L days on
//             an FS link (odd seeds) or the predecessor's duration +L days
//             (even seeds)                              -> progress 0, revisions +L
//   window 4: both, on other activities                 -> progress +S2, revisions +L2
//
// The planted S and L days are what was typed, not always what the finish
// moves by: an SS link off the slipped activity, a successor on a 5-day
// calendar after a 7-day lag, or a constraint changes the effect. So the
// expected split is measured from counterfactual files: the progress effect is
// the finish of the window's file built with the slip and without the lag,
// against the previous update; the revision effect is the rest. Checked: the
// split equals that exactly; a slip-only window shows revisions 0 and a
// lag-only window progress 0; the planted activity or link is named among the
// window's drivers; the windows add up to the whole movement; and how often
// the nominal days equal the effect (reported, not a pass condition).
//
//   node eval/windows-check.mjs <dir-with-xer-files> [--seeds 5] [--json out.json]
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseXer, decodeXer, parseDate, num } from "../xer.mjs";
import { schedule, drivingPath } from "../cpm.mjs";
import { pickProject } from "../compare.mjs";
import { statusAsPlanned, cloneXer } from "../status.mjs";
import { windows } from "../windows.mjs";

const args = process.argv.slice(2);
const dir = args[0];
const SEEDS = args.includes("--seeds") ? +args[args.indexOf("--seeds") + 1] : 5;
const STEP_DAYS = 20;

function rng(seed) {
  let x = (seed * 2654435761) >>> 0 || 1;
  return () => ((x ^= x << 13, x ^= x >>> 17, x ^= x << 5) >>> 0) / 4294967296;
}

// candidates on xer's driving path for a planted slip in the window ending at dd
function slipCandidates(xer, projId, dd) {
  const res = schedule(xer);
  const p = res.projects.get(projId);
  const path = drivingPath(res, projId).map((id) => res.model.tasks.get(id));
  return path.filter((t) => {
    const r = res.tasks.get(t.id);
    const es = r.remES ?? r.es;
    return t.type !== "TT_Mile" && t.type !== "TT_FinMile" && es < dd && t.cal === p.cal;
  }).map((t) => t.code);
}

// FS links on xer's driving path whose two ends start after dd, predecessor on the project calendar
function lagCandidates(xer, projId, dd) {
  const res = schedule(xer);
  const p = res.projects.get(projId);
  const ids = drivingPath(res, projId);
  const out = [];
  for (let i = 1; i < ids.length; i++) {
    const s = res.model.tasks.get(ids[i]), pr = res.model.tasks.get(ids[i - 1]);
    const rel = s.preds.find((r) => r.predId === pr.id && r.type === "PR_FS");
    if (!rel) continue;
    const rp = res.tasks.get(pr.id);
    if ((rp.remES ?? rp.es) <= dd || pr.status !== "TK_NotStart" || pr.cal !== p.cal) continue;
    if (res.model.rels.filter((r) => r.predId === pr.id && r.succId === s.id).length !== 1) continue;
    out.push({ relId: rel.id, pred: pr.code, succ: s.code });
  }
  return out;
}

function addLag(xer, relId, hours) {
  const x = cloneXer(xer);
  for (const r of x.tables.TASKPRED) if (r.task_pred_id === relId) r.lag_hr_cnt = String((num(r.lag_hr_cnt) ?? 0) + hours);
  return x;
}

// re-estimate an unstarted activity: original and remaining duration up
function addDuration(xer, code, hours) {
  const x = cloneXer(xer);
  for (const r of x.tables.TASK) if (r.task_code === code) for (const f of ["target_drtn_hr_cnt", "remain_drtn_hr_cnt"]) r[f] = String((num(r[f]) ?? 0) + hours);
  return x;
}

function runFile(path, seed) {
  const xer = parseXer(decodeXer(readFileSync(path)));
  const res0 = schedule(xer);
  const p0 = pickProject(xer, res0.model, null);
  const projId = p0.id;
  const p = res0.projects.get(projId);
  const hpd = p.cal.hoursPerDay || 8;
  const rand = rng(seed);
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const step = (dd) => p.cal.addWork(dd, STEP_DAYS * hpd * 60);
  const S = 1 + Math.floor(rand() * 5), L = 1 + Math.floor(rand() * 5), S2 = 1 + Math.floor(rand() * 5), L2 = 1 + Math.floor(rand() * 5);
  const plan = [];
  const finOf = (x) => { const r = schedule(x); const q = r.projects.get(projId); return { f: q.finish, cal: q.cal }; };
  const wdays = (a, b, cal) => Math.round((cal.workBetween(a, b) / 60 / (cal.hoursPerDay || 8)) * 10) / 10;
  // effect of progress alone: the window's file without its revision, against the previous update
  const effect = (prev, progOnly, full) => { const a = finOf(prev), b = finOf(progOnly), c = finOf(full); return { progress: wdays(a.f, b.f, c.cal), revisions: Math.round((wdays(a.f, c.f, c.cal) - wdays(a.f, b.f, c.cal)) * 10) / 10 }; };
  const u = [xer];
  let dd = p.dataDate;
  // window 1: as planned
  dd = step(dd);
  u.push(statusAsPlanned(u[0], projId, dd));
  plan.push({ progress: 0, revisions: 0, ...effect(u[0], u[1], u[1]), nominal: { progress: 0, revisions: 0 } });
  // window 2: progress slip
  dd = step(dd);
  let cand = slipCandidates(u[1], projId, dd);
  const slip1 = cand.length ? pick(cand) : null;
  u.push(statusAsPlanned(u[1], projId, dd, { slips: slip1 ? [{ code: slip1, hours: S * hpd }] : [] }));
  plan.push({ ...effect(u[1], u[2], u[2]), slip: slip1, nominal: { progress: slip1 ? S : 0, revisions: 0 } });
  // window 3: revision (lag)
  dd = step(dd);
  let x3 = statusAsPlanned(u[2], projId, dd);
  const x3p = x3;
  const lc = lagCandidates(x3, projId, dd);
  const lag1 = lc.length ? pick(lc) : null;
  if (lag1 && seed % 2) x3 = addLag(x3, lag1.relId, L * hpd);
  else if (lag1) { x3 = addDuration(x3, lag1.pred, L * hpd); lag1.duration = true; }
  u.push(x3);
  plan.push({ ...effect(u[2], x3p, x3), lag: lag1, nominal: { progress: 0, revisions: lag1 ? L : 0 } });
  // window 4: both
  dd = step(dd);
  cand = slipCandidates(u[3], projId, dd);
  const slip2 = cand.length ? pick(cand) : null;
  let x4 = statusAsPlanned(u[3], projId, dd, { slips: slip2 ? [{ code: slip2, hours: S2 * hpd }] : [] });
  const x4p = x4;
  const lc2 = lagCandidates(x4, projId, dd);
  const lag2 = lc2.length ? pick(lc2) : null;
  if (lag2) x4 = addLag(x4, lag2.relId, L2 * hpd);
  u.push(x4);
  plan.push({ ...effect(u[3], x4p, x4), slip: slip2, lag: lag2, nominal: { progress: slip2 ? S2 : 0, revisions: lag2 ? L2 : 0 } });

  const t0 = Date.now();
  // shuffled order: windows.mjs must sort by data date
  const order = u.map((x, i) => ({ xer: x, label: `U${i}` })).sort(() => rand() - 0.5);
  const rep = windows(order);
  const ms = Date.now() - t0;
  const rows = rep.windows.map((w, i) => {
    const e = plan[i];
    const named = (e.slip ? w.drivers.progress.some((d) => d.code === e.slip) : true) && (e.lag ? w.drivers.revisions.some((d) => d.code === (e.lag.duration ? e.lag.pred : `${e.lag.pred} -> ${e.lag.succ}`)) : true);
    const side = (!e.lag || w.progressEffect === (e.slip ? e.progress : 0)) && (!!e.lag || w.revisionEffect === 0);
    return { window: w.n, expect: { progress: e.progress, revisions: e.revisions, slip: e.slip || null, lag: e.lag ? (e.lag.duration ? `duration ${e.lag.pred}` : `${e.lag.pred} -> ${e.lag.succ}`) : null, nominal: e.nominal }, got: { moved: w.moved, progress: w.progressEffect, revisions: w.revisionEffect }, splitExact: w.progressEffect === e.progress && w.revisionEffect === e.revisions, side, nominal: w.progressEffect === e.nominal.progress && w.revisionEffect === e.nominal.revisions, named };
  });
  return { file: path.split("/").pop(), seed, activities: [...res0.model.tasks.values()].filter((t) => t.proj === projId && !t.span && t.status !== "TK_Complete").length, ordered: rep.updates.map((x) => x.label).join(",") === "U0,U1,U2,U3,U4", rows, asPlannedZero: rep.windows[0].moved === 0, asPlannedDrivers: rep.windows[0].drivers.progress.length + rep.windows[0].drivers.revisions.length, total: rep.total, addsUp: rep.total.moved === rep.total.sumOfWindows, ms, warnings: rep.warnings.length };
}

const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".xer")).sort();
const all = [];
for (const f of files) {
  for (let s = 1; s <= SEEDS; s++) {
    let r;
    try { r = runFile(join(dir, f), s); } catch (e) { r = { file: f, seed: s, error: e.message }; }
    all.push(r);
    if (r.error) { console.log(`${f} seed ${s}: ERROR ${r.error}`); continue; }
    const bad = r.rows.filter((x) => !x.splitExact || !x.named || !x.side);
    console.log(`${f} seed ${s}: ${r.rows.filter((x) => x.splitExact).length}/4 split exact, ${r.rows.filter((x) => x.side).length}/4 side, ${r.rows.filter((x) => x.named).length}/4 named, ${r.rows.filter((x) => x.nominal).length}/4 nominal, as planned 0 ${r.asPlannedZero} (drivers ${r.asPlannedDrivers}), adds up ${r.addsUp}, sorted ${r.ordered}, ${r.ms} ms${bad.length ? "  " + JSON.stringify(bad.map((x) => ({ w: x.window, e: x.expect, g: x.got, named: x.named }))) : ""}`);
  }
}
const ok = all.filter((r) => !r.error);
const rows = ok.flatMap((r) => r.rows);
const planted = rows.filter((x) => x.expect.slip || x.expect.lag);
console.log(`\nTOTAL: ${ok.length} series, ${rows.length} windows: split exact ${rows.filter((x) => x.splitExact).length}; right side ${rows.filter((x) => x.side).length}; nominal days ${rows.filter((x) => x.nominal).length}; planted windows ${planted.length}, planted named ${planted.filter((x) => x.named).length}; series adding up ${ok.filter((r) => r.addsUp).length}; as-planned windows at 0 ${ok.filter((r) => r.asPlannedZero).length} (with no drivers ${ok.filter((r) => r.asPlannedZero && !r.asPlannedDrivers).length}); sorted ${ok.filter((r) => r.ordered).length}; errors ${all.length - ok.length}`);
if (args.includes("--json")) writeFileSync(args[args.indexOf("--json") + 1], JSON.stringify(all, null, 1) + "\n");
