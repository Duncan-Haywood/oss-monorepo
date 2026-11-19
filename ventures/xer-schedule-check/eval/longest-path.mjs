// Longest path against P6's own flag, and float paths to the finish.
//
//   node eval/longest-path.mjs <dir-or-files...> [--json out.json]
//
// (1) For every project P6 scheduled, compares floatpaths.mjs longestPath()
// with the activities P6 flagged TASK.driving_path_flag = 'Y' at its last
// schedule run, over open activities (not complete, not level of effort or
// WBS summary). (2) Runs floatPaths() to the project's finish activity and
// checks the backward pass behind relative float: run from the finish
// activity's own late finish over its predecessors alone, it must give
// every activity a float no smaller than the total float P6's rules give
// (cpm.mjs takes the least over all successors, constraints and dates), and
// the same float wherever the finish is what binds. TF above the bound
// would be a bug in targetBound.
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { parseXer, decodeXer } from "../xer.mjs";
import { schedule } from "../cpm.mjs";
import { longestPath, floatPaths, finishActivity, drivingInto, targetBound, floatAgainst } from "../floatpaths.mjs";

const args = process.argv.slice(2);
const jsonOut = args.includes("--json") ? args[args.indexOf("--json") + 1] : null;
const files = [];
for (const a of args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--json")) {
  if (statSync(a).isDirectory()) for (const f of readdirSync(a).sort()) { if (/\.xer$/i.test(f)) files.push(join(a, f)); }
  else files.push(a);
}
const out = [];
for (const f of files) {
  const xer = parseXer(decodeXer(readFileSync(f)));
  const res = schedule(xer);
  const { model } = res;
  for (const [pid, p] of res.projects) {
    const tasks = [...model.tasks.values()].filter((t) => t.proj === pid);
    if (!tasks.some((t) => t.row.early_end_date)) continue; // P6 never scheduled it
    const openT = tasks.filter((t) => !t.span && t.status !== "TK_Complete");
    const flagged = new Set(openT.filter((t) => t.row.driving_path_flag === "Y").map((t) => t.id));
    const flaggedAll = tasks.filter((t) => t.row.driving_path_flag === "Y");
    const t0 = Date.now();
    const ours = longestPath(res, pid);
    const both = [...ours].filter((id) => flagged.has(id)).length;
    // P6's own stored float on the activities it flagged: a flag from the run
    // that wrote these dates sits on the least-float chain
    const p6tf = [...flagged].map((id) => Number(model.tasks.get(id).row.total_float_hr_cnt)).filter(Number.isFinite);
    const end = finishActivity(res, pid);
    let fp = null, prop = null;
    if (end) {
      fp = floatPaths(res, end.id, { count: 1e9 });
      // the same backward pass seeded at the finish activity's own late
      // finish: every activity's total float can be no more than its float
      // against this one route set, and equals it where the finish binds
      const late = targetBound(res, end.id, res.tasks.get(end.id).lf);
      let n = 0, eq = 0, above = 0; const worst = [];
      for (const [id, b] of late) {
        const tf = res.tasks.get(id).tf, f = floatAgainst(res, id, b);
        n++;
        if (Math.abs(tf - f) < 0.01) eq++;
        else if (tf > f) { above++; worst.push([+(tf - f).toFixed(2), model.tasks.get(id).code]); }
      }
      worst.sort((x, y) => y[0] - x[0]);
      // zero relative float is exactly the activities whose driving links lead into the finish activity
      const zero = new Set(fp.paths.flatMap((x) => x.activities).filter((a) => a.rf === 0).map((a) => a.id));
      const into = drivingInto(res, [end.id]);
      const zeroSame = zero.size === into.size && [...zero].every((id) => into.has(id));
      prop = { activities: n, equal: eq, tfAboveBound: above, worst: worst.slice(0, 3), zeroFloat: zero.size, drivingIntoFinish: into.size, zeroIsLongestPath: zeroSame };
    }
    const row = {
      file: basename(f), project: p.code, open: openT.length,
      p6Flagged: flagged.size, p6FlaggedAll: flaggedAll.length, p6FlaggedComplete: flaggedAll.filter((t) => t.status === "TK_Complete").length,
      p6FlaggedMaxStoredFloat: p6tf.length ? Math.max(...p6tf) : null,
      ours: ours.size, both, onlyP6: flagged.size - both, onlyOurs: ours.size - both,
      finish: end ? end.code : null,
      paths: fp ? fp.paths.length : 0, inPaths: fp ? fp.paths.reduce((s, x) => s + x.activities.length, 0) : 0,
      path2: fp && fp.paths[1] ? { float: fp.paths[1].float, length: fp.paths[1].activities.length } : null,
      finishBound: prop, ms: Date.now() - t0,
    };
    out.push(row);
    console.log(`${row.file} [${row.project}]: P6 flagged ${row.p6Flagged} open (${row.p6FlaggedComplete} complete also flagged, max stored float ${row.p6FlaggedMaxStoredFloat} h); ours ${row.ours}; both ${row.both}, only P6 ${row.onlyP6}, only ours ${row.onlyOurs}. Float paths to ${row.finish}: ${row.paths} paths over ${row.inPaths} activities; TF equals the finish-only bound on ${prop ? `${prop.equal}/${prop.activities}, TF above it on ${prop.tfAboveBound}${prop.worst.length ? " " + JSON.stringify(prop.worst) : ""}; zero relative float ${prop.zeroFloat} (${prop.zeroIsLongestPath ? "= the driving chains into it" : `NOT the ${prop.drivingIntoFinish} driving into it`})` : "-"}; ${row.ms} ms`);
  }
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 2) + "\n");
