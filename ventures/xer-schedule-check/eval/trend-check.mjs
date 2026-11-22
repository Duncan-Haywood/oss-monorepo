// Does trend.mjs read a series of updates right, on real P6 files?
// No public series of real consecutive updates exists (eval/compare-check-*),
// so, as in eval/windows-check.mjs, each real file is the first update of a
// series made by statusing it as planned (status.mjs) every 20 working days.
//
// Series A, as planned (4 updates after the file): every activity finishes
// on the first update's forecast, so the trend must show
//   - BEI against the first update at least 1.000 (DCMA's BEI counts every
//     finished activity, so work done early can lift it past 1) or no due
//     work, and 0 missed tasks in every update;
//   - a finish that does not move, and no activity listed as eroding because
//     its own forecast finish moved later. Float can still fall with nothing
//     late: an activity under way whose successors are start-to-start has its
//     late finish pulled in as its remaining duration shrinks (P6's rule,
//     cpm.mjs). Those rows are listed with cause "late finish earlier" and
//     counted here, not failed.
// The single-file BEI of dcma.mjs (planned dates as the baseline) is printed
// beside it for each update, for the reader.
//
// Series B, the same with two planted slips in the second window, S working
// days each: one on an activity on the driving path that is under way or
// due in the window (as windows-check.mjs picks it), one on an open activity
// off the path with more than S + 2 days of float, on the project calendar,
// started by the second data date and forecast to finish after the last
// (erosion lists only work still open at the end).
// The trend must
//   - name the driving-path activity as missed in every later update, when
//     its baseline finish is on or before that update's data date, and not
//     otherwise;
//   - list the off-path activity in the float erosion exactly when its float
//     really fell over the series (measured from schedule runs of the files:
//     an FF predecessor or a constraint can hold its finish so the slip costs
//     nothing), and report how often the loss is the S days typed.
//
//   node eval/trend-check.mjs <dir-with-xer-files> [--seeds 3] [--json out.json]
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseXer, decodeXer, parseDate } from "../xer.mjs";
import { schedule, drivingPath } from "../cpm.mjs";
import { pickProject } from "../compare.mjs";
import { statusAsPlanned } from "../status.mjs";
import { assess } from "../dcma.mjs";
import { trend } from "../trend.mjs";

const args = process.argv.slice(2);
const dir = args[0];
const SEEDS = args.includes("--seeds") ? +args[args.indexOf("--seeds") + 1] : 3;
const STEP_DAYS = 20, S = 5, N = 4;

function rng(seed) {
  let x = (seed * 2654435761) >>> 0 || 1;
  return () => ((x ^= x << 13, x ^= x >>> 17, x ^= x << 5) >>> 0) / 4294967296;
}

function series(xer0, projId, slipsAt2 = []) {
  const res = schedule(xer0);
  const p = res.projects.get(projId);
  const hpd = p.cal.hoursPerDay || 8;
  let dd = p.dataDate;
  const out = [{ xer: xer0, label: "u0" }];
  let x = xer0;
  for (let k = 1; k <= N; k++) {
    dd = p.cal.addWork(dd, STEP_DAYS * hpd * 60);
    x = statusAsPlanned(x, projId, dd, { slips: k === 2 ? slipsAt2.map((code) => ({ code, hours: S * hpd })) : [] });
    out.push({ xer: x, label: `u${k}` });
  }
  return { list: out, p, res };
}

const files = readdirSync(dir).filter((f) => /\.xer$/i.test(f)).sort();
const results = [];
for (const f of files) {
  const xer = parseXer(decodeXer(readFileSync(join(dir, f))));
  const res = schedule(xer);
  const proj = pickProject(xer, res.model, null);
  if (!proj) continue;
  const projId = proj.id;
  const t0 = Date.now();
  // A: as planned
  const A = series(xer, projId);
  let ta;
  try { ta = trend(A.list); } catch (e) { results.push({ file: f, error: e.message }); console.log(`${f}: ${e.message}`); continue; }
  const singleBei = A.list.map((u) => assess(u.xer, { projId }).checks.find((c) => c.id === 14).value);
  const a = {
    missed: ta.updates.map((u) => u.baselineExecution.missed),
    bei: ta.updates.map((u) => u.baselineExecution.bei),
    singleFileBei: singleBei,
    finishMoved: ta.summary.finishMoved,
    eroding: ta.erosion.length,
    erosionCauses: Object.fromEntries([...new Set(ta.erosion.map((e) => e.cause))].map((c) => [c, ta.erosion.filter((e) => e.cause === c).length])),
    finishSlipped: ta.erosion.filter((e) => e.finishLater > 0.05).map((e) => e.code),
  };
  a.ok = a.missed.every((m) => m === 0) && a.bei.every((b) => b === null || b >= 1) && (a.finishMoved === 0 || a.finishMoved === null) && a.finishSlipped.length === 0;
  const row = { file: f, project: ta.project, open: ta.updates[0].open, A: a, B: [] };
  // B: planted slips, several seeds
  const p = A.p;
  const hpd = p.cal.hoursPerDay || 8;
  const dd1 = A.list[1].xer;
  const r1 = schedule(dd1);
  const dd2 = p.cal.addWork(p.cal.addWork(p.dataDate, STEP_DAYS * hpd * 60), STEP_DAYS * hpd * 60);
  const path = drivingPath(r1, projId).map((id) => r1.model.tasks.get(id));
  const onPath = new Set(path.map((t) => t.code));
  const cal1 = r1.projects.get(projId).cal;
  let ddN = p.dataDate;
  for (let k = 0; k < N; k++) ddN = p.cal.addWork(ddN, STEP_DAYS * hpd * 60);
  const pathCands = path.filter((t) => {
    const v = r1.tasks.get(t.id);
    return t.type !== "TT_Mile" && t.type !== "TT_FinMile" && (v.remES ?? v.es) < dd2 && t.cal === cal1;
  }).map((t) => t.code);
  const offCands = [...r1.model.tasks.values()].filter((t) => {
    if (t.proj !== projId || t.span || t.status === "TK_Complete" || onPath.has(t.code) || t.cal !== cal1) return false;
    if (t.type === "TT_Mile" || t.type === "TT_FinMile") return false;
    const v = r1.tasks.get(t.id);
    // still open at the last update, so it is in the erosion list at all
    return v && v.tf / hpd > S + 2 && (v.remES ?? v.es) < dd2 && v.ef > ddN;
  }).map((t) => t.code);
  for (let seed = 1; seed <= SEEDS; seed++) {
    const rand = rng(seed * 7919 + f.length);
    const slipPath = pathCands.length ? pathCands[Math.floor(rand() * pathCands.length)] : null;
    const slipOff = offCands.length ? offCands[Math.floor(rand() * offCands.length)] : null;
    const B = series(xer, projId, [slipPath, slipOff].filter(Boolean));
    const tb = trend(B.list);
    const b = { seed, slipPath, slipOff };
    if (slipPath) {
      // the baseline finish of the slipped activity: its finish in u0's run
      const t = A.res.model.tasks.get([...A.res.model.tasks.values()].find((x) => x.code === slipPath && x.proj === projId).id);
      const base = t.actEnd ?? A.res.tasks.get(t.id).ef;
      const checks = tb.updates.slice(2).map((u, i) => {
        const dd = parseDate(u.dataDate);
        const due = base <= dd;
        const named = u.baselineExecution.missedItems.some((m) => m.code === slipPath);
        return { update: `u${i + 2}`, due, named };
      });
      b.path = checks;
      b.pathRight = checks.every((c) => c.due === c.named);
    }
    if (slipOff) {
      const e = tb.erosion.find((x) => x.code === slipOff);
      // what the slip really did to its float, from the schedule runs: it
      // can cost nothing (an FF predecessor or a constraint holds the finish)
      const fl = (u) => { const r = schedule(u.xer); const t = [...r.model.tasks.values()].find((q) => q.code === slipOff && q.proj === projId); const v = r.tasks.get(t.id); return v.tf / (t.cal.hoursPerDay || 8); };
      b.offFloatFell = Math.round((fl(B.list[0]) - fl(B.list[N])) * 10) / 10;
      b.offExpected = b.offFloatFell > 0.05;
      b.offListed = !!e;
      b.offRight = b.offListed === b.offExpected;
      b.offFloat = e ? e.float : null;
      // the loss across the slipped window (u1 -> u2), in working days
      b.offLoss = e && e.float.length >= 3 ? Math.round((e.float[1] - e.float[2]) * 10) / 10 : null;
      b.offLossIsS = b.offLoss === S;
      b.offLossMatches = e ? Math.abs(b.offLoss - b.offFloatFell) < 0.15 || Math.abs((e.float[0] - e.floatNow) - b.offFloatFell) < 0.15 : null;
    }
    b.passedLast = tb.summary.passedLast;
    b.newlyFailingAtSlip = tb.updates[2].newlyFailing.map((n) => `${n.name}: ${n.count}`);
    row.B.push(b);
  }
  row.seconds = Math.round((Date.now() - t0) / 100) / 10;
  results.push(row);
  console.log(`${f}: A ${a.ok ? "ok" : "FAIL"} (missed ${a.missed.join("/")}, BEI ${a.bei.join("/")}, single-file BEI ${singleBei.join("/")}, finish ${a.finishMoved}, eroding ${a.eroding} ${JSON.stringify(a.erosionCauses)}); B ${row.B.map((b) => `[path ${b.slipPath ?? "-"} ${b.pathRight === undefined ? "-" : b.pathRight ? "ok" : "FAIL"}; off ${b.slipOff ?? "-"} ${b.offListed === undefined ? "-" : `${b.offListed ? `listed, loss ${b.offLoss}` : "not listed"} (float fell ${b.offFloatFell}) ${b.offRight ? "ok" : "FAIL"}`}]`).join(" ")} (${row.seconds} s)`);
}
if (args.includes("--json")) writeFileSync(args[args.indexOf("--json") + 1], JSON.stringify({ S, STEP_DAYS, updates: N + 1, results }, null, 2) + "\n");
const okA = results.filter((r) => r.A?.ok).length, nA = results.filter((r) => r.A).length;
const Bs = results.flatMap((r) => r.B || []);
const pathN = Bs.filter((b) => b.pathRight !== undefined), offN = Bs.filter((b) => b.offListed !== undefined);
console.log(`\nA as planned: ${okA}/${nA} files clean. B: driving-path slip named exactly when due ${pathN.filter((b) => b.pathRight).length}/${pathN.length}; off-path slip listed exactly when its float fell ${offN.filter((b) => b.offRight).length}/${offN.length} (fell in ${offN.filter((b) => b.offExpected).length}; listed loss = ${S} days in ${offN.filter((b) => b.offLossIsS).length}).`);
