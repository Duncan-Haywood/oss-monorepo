// Earned value across updates (evmseries.mjs) on public P6 files, against
// known answers. For each cost- or hours-loaded file: update 1 is the file;
// update 2 is it statused as planned four weeks on (status.mjs, costs and
// units posted at the planned rate); update 3 is update 2 statused four more
// weeks with planted slips (extra remaining hours on activities worked in the
// window) and planted overruns (cost spent x 1.5) on other activities.
// Checks:
//   - window 1 (as planned): earned / promised 1.000 and no activity behind or
//     ahead of its promise;
//   - window 2: every planted slip that was worked in the window is named
//     "earned less than promised" (recall), and every other activity named
//     there is a logic successor of a planted slip (pushed later by it);
//   - every planted overrun is named "spent well past what it earned", and
//     how many unplanted activities window 1 names there (the file's own
//     remaining cost against its budget: the background);
//   - the first update's planned value at its own data date equals evm.mjs's.
//
//   node eval/evm-series-check.mjs <dir-or-files...> [--json out.json] [--n 20] [--seed 1]
//
// eval/evm-series-check-2026-11-20.md
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { decodeXer } from "../xer.mjs";
import { parseSchedule } from "../mspdi.mjs";
import { schedule } from "../cpm.mjs";
import { assess } from "../dcma.mjs";
import { statusAsPlanned } from "../status.mjs";
import { earnedValue } from "../evm.mjs";
import { earnedValueSeries } from "../evmseries.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const jsonOut = opt("--json", null), N = Number(opt("--n", 20)), SEED = Number(opt("--seed", 1));
const files = [];
for (const a of args.filter((a, i) => !a.startsWith("--") && !["--json", "--n", "--seed"].includes(args[i - 1]))) {
  if (statSync(a).isDirectory()) { for (const f of readdirSync(a)) if (/\.xer$/i.test(f)) files.push(join(a, f)); } else files.push(a);
}
let s = SEED >>> 0;
const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
const shuffle = (xs) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const WEEK4 = 28 * 1440;

const out = [];
for (const f of files.sort()) {
  const t0 = Date.now();
  const x0 = parseSchedule(decodeXer(readFileSync(f)));
  const res0 = schedule(x0);
  const pid = assess(x0, { result: res0 }).project.id;
  const ev0 = earnedValue(x0, { projId: pid, result: res0 });
  const row = { file: f.split("/").pop(), measure: ev0.measure };
  if (!ev0.measure) { row.note = "not loaded"; out.push(row); console.log(JSON.stringify(row)); continue; }
  const dd0 = res0.model.projects.get(pid).dataDate;
  const x1 = statusAsPlanned(x0, pid, dd0 + WEEK4);
  // candidates: open, loaded, not LOE/WBS, worked in window 2 on update 2's forecast
  const res1 = schedule(x1), dd1 = dd0 + WEEK4, dd2 = dd1 + WEEK4;
  const ev1 = earnedValue(x1, { projId: pid, result: res1 });
  const loaded = new Map(ev1.activities.filter((a) => a.bac > 0).map((a) => [a.code, a]));
  const cand = [];
  for (const r of x1.tables.TASK) {
    if (r.proj_id !== pid || r.status_code === "TK_Complete" || ["TT_LOE", "TT_WBS", "TT_Mile", "TT_FinMile"].includes(r.task_type) || !loaded.has(r.task_code)) continue;
    const c = res1.tasks.get(r.task_id);
    const es = c?.remES ?? c?.es;
    if (Number.isFinite(es) && es < dd2 && c.ef > es) cand.push(r);
  }
  // overruns need cost spent in the window: remaining cost on the assignments
  const remCost = new Map();
  for (const a of x1.tables.TASKRSRC || []) remCost.set(a.task_id, (remCost.get(a.task_id) || 0) + (Number(a.remain_cost) || 0));
  const picked = shuffle(cand);
  const slipRows = picked.slice(0, N);
  const overRows = picked.slice(N).filter((r) => ev0.measure === "cost" && remCost.get(r.task_id) > 10).slice(0, N);
  const slips = slipRows.map((r) => ({ code: r.task_code, hours: 40 }));
  const overruns = overRows.map((r) => ({ code: r.task_code, factor: 1.5 }));
  const x2 = statusAsPlanned(x1, pid, dd2, { slips, overruns });
  const rep = earnedValueSeries([{ xer: x0, label: "file" }, { xer: x1, label: "as planned +4 wk" }, { xer: x2, label: "planted +8 wk" }]);
  const [w1, w2] = rep.windows;
  // successors (transitive) of the planted slips, on update 2's logic
  const succ = new Map();
  for (const p of x1.tables.TASKPRED || []) { if (!succ.has(p.pred_task_id)) succ.set(p.pred_task_id, []); succ.get(p.pred_task_id).push(p.task_id); }
  const codeOf = new Map(x1.tables.TASK.map((r) => [r.task_id, r.task_code]));
  const down = new Set(), stack = slipRows.map((r) => r.task_id);
  while (stack.length) { const id = stack.pop(); for (const n of succ.get(id) || []) if (!down.has(n)) { down.add(n); stack.push(n); } }
  const downCodes = new Set([...down].map((id) => codeOf.get(id)));
  const slipSet = new Set(slips.map((x) => x.code)), overSet = new Set(overruns.map((x) => x.code));
  const behind2 = new Set(w2.behind.map((r) => r.code)), costlier2 = new Set(w2.costlier.map((r) => r.code));
  Object.assign(row, {
    ms: Date.now() - t0,
    activitiesLoaded: loaded.size,
    pvBaselineAtFirst: rep.updates[0].pvBaseline, pvFirst: rep.updates[0].pv, pvAgrees: Math.abs((rep.updates[0].pvBaseline ?? 0) - (rep.updates[0].pv ?? 0)) <= 0.05,
    window1: { earned: w1.earned, promised: w1.promised, performance: w1.performance, behind: w1.behind.length, ahead: w1.ahead.length, costlier: w1.costlier.length, spent: w1.spent, cpi: w1.cpi },
    window2: { earned: w2.earned, promised: w2.promised, performance: w2.performance, behind: w2.behind.length, ahead: w2.ahead.length, costlier: w2.costlier.length, spent: w2.spent, cpi: w2.cpi },
    slips: slips.length,
    slipsNamed: slips.filter((x) => behind2.has(x.code)).length,
    slipsMissed: slips.filter((x) => !behind2.has(x.code)).map((x) => x.code),
    behindNotPlanted: w2.behind.filter((r) => !slipSet.has(r.code)).length,
    behindNotPlantedDownstream: w2.behind.filter((r) => !slipSet.has(r.code) && downCodes.has(r.code)).length,
    behindUnexplained: w2.behind.filter((r) => !slipSet.has(r.code) && !downCodes.has(r.code)).map((r) => r.code).slice(0, 20),
    ahead2NotPlanted: w2.ahead.length,
    overruns: overruns.length,
    overrunsNamed: overruns.filter((x) => costlier2.has(x.code)).length,
    costlierNotPlanted2: w2.costlier.filter((r) => !overSet.has(r.code) && !slipSet.has(r.code)).length,
  });
  out.push(row);
  console.log(JSON.stringify(row));
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 1) + "\n");
