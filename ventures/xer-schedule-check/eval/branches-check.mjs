// Check probabilistic branches in the risk run (risk.mjs, `branches`) on real
// P6 exports.
//
//   node eval/branches-check.mjs <dir-or-files...> [--picks 4] [--runs 120] [--seed 1] [--json out.json]
//
// No public P6 file publishes a branch register, so the branches are planted
// on each file's own driving path (seeded picks of not-started activities with
// work left). Ranges are zero-width in checks 1, 2 and 4, so every run's
// finish is one of a few dates that a second route (cpm.mjs scheduled
// directly, with the dropped activity's remaining duration set to 0) gives:
//
// 1. One branch {X} at 50%, the remainder dropping X: every run's finish is
//    the forecast or the finish with X at 0; P10 is the latter, P90 the
//    former; the drawn share is within 4 standard errors of 50%.
// 2. Two branches {X} and {Y} at 50% each: every run drops exactly one, so
//    every finish is the finish with X at 0 or with Y at 0, never the
//    forecast (unless one of those equals it).
// 3. Draws untouched: on the default 90/100/125 range, a group naming only
//    a completed activity or a milestone (nothing to drop) gives the same
//    percentiles, date for date, as the run with no branches.
// 4. A sure 5-day risk event on X in a 50% branch: runs that keep X finish
//    as X with 5 days added, runs that drop it as X at 0 (the event adds
//    nothing to work that does not happen).
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { decodeXer } from "../xer.mjs";
import { parseSchedule } from "../mspdi.mjs";
import { schedule, buildModel, drivingPath } from "../cpm.mjs";
import { riskAnalysis, rng } from "../risk.mjs";

const args = process.argv.slice(2);
const val = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const VALUED = new Set(["--picks", "--runs", "--seed", "--json"]);
const paths = args.filter((a, i) => !a.startsWith("--") && !VALUED.has(args[i - 1]));
const files = paths.flatMap((p) => (statSync(p).isDirectory() ? readdirSync(p).filter((f) => /\.xer$/i.test(f)).sort().map((f) => join(p, f)) : [p]));
const PICKS = Number(val("--picks", 4)), RUNS = Number(val("--runs", 120)), SEED = Number(val("--seed", 1));
const zero = { min: 1, likely: 1, max: 1 };

const out = [];
let pass = 0, fail = 0;
const ok = (cond, what, rec) => { rec.checks++; if (cond) pass++; else { fail++; rec.failures.push(what); } };
for (const f of files) {
  const label = f.split("/").pop();
  const t0 = Date.now();
  const xer = parseSchedule(decodeXer(readFileSync(f)));
  const model = buildModel(xer);
  const base = schedule(xer, { model, forwardOnly: true });
  // the project the risk run picks: most open activities
  const counts = new Map();
  for (const t of model.tasks.values()) if (!t.span && t.status !== "TK_Complete") counts.set(t.proj, (counts.get(t.proj) || 0) + 1);
  const pid = [...counts].sort((a, b) => b[1] - a[1])[0][0];
  const fDet = base.projects.get(pid).finish;
  const path = drivingPath(base, pid).map((id) => model.tasks.get(id)).filter((t) => t && t.status === "TK_NotStart" && t.type === "TT_Task" && t.remain > 0);
  const rand = rng(SEED);
  const pool = [...path];
  const picks = [];
  while (pool.length && picks.length < PICKS) picks.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  const finishWith = (m) => schedule(xer, { model, forwardOnly: true, durations: m }).projects.get(pid).finish;
  const rec = { file: label, activities: model.tasks.size, drivingNotStarted: path.length, picks: picks.map((t) => t.code), checks: 0, failures: [] };
  const base0 = { model, projId: pid, iterations: RUNS, seed: SEED, range: zero };

  for (const x of picks) {
    // 1
    const f0 = finishWith(new Map([[x.id, 0]]));
    const r1 = riskAnalysis(xer, { ...base0, branches: [{ id: "G", branches: [{ name: "keep", probability: 0.5, codes: [x.code] }] }] });
    const p = (r, q) => r.percentiles.find((y) => y.p === q).date;
    ok(r1.percentiles.every((q) => q.date === fDet || q.date === f0), `1 ${x.code}: a finish outside {forecast, X at 0}`, rec);
    if (f0 !== fDet) ok(p(r1, 10) === f0 && p(r1, 90) === fDet, `1 ${x.code}: P10/P90 not X at 0 / forecast`, rec);
    const k = r1.branches[0].branches[0].taken;
    ok(Math.abs(k - 0.5) <= 4 * Math.sqrt(0.25 / RUNS), `1 ${x.code}: drawn ${k}`, rec);
    rec.shifts = rec.shifts || [];
    rec.shifts.push({ code: x.code, finishShiftDays: r1.branches[0].branches[0].finishShift, dropFinishMinutesEarlier: fDet - f0 });
    // 4
    const hpd = x.cal.hoursPerDay || 8;
    const f5 = finishWith(new Map([[x.id, x.remain + 5 * hpd * 60]]));
    const r4 = riskAnalysis(xer, { ...base0, branches: [{ id: "G", branches: [{ name: "keep", probability: 0.5, codes: [x.code] }] }], risks: [{ id: "E", probability: 1, min: 5, likely: 5, max: 5, codes: [x.code] }] });
    ok(r4.percentiles.every((q) => q.date === f5 || q.date === f0), `4 ${x.code}: a finish outside {X + 5 days, X at 0}`, rec);
  }
  // 2
  for (let i = 0; i + 1 < picks.length; i += 2) {
    const [x, y] = [picks[i], picks[i + 1]];
    const fx = finishWith(new Map([[x.id, 0]])), fy = finishWith(new Map([[y.id, 0]]));
    const r2 = riskAnalysis(xer, { ...base0, branches: [{ id: "G", branches: [{ name: "x", probability: 0.5, codes: [x.code] }, { name: "y", probability: 0.5, codes: [y.code] }] }] });
    ok(r2.percentiles.every((q) => q.date === fx || q.date === fy), `2 ${x.code}/${y.code}: a finish outside {X at 0, Y at 0}`, rec);
    ok(r2.branches[0].none === null, `2: a remainder where the probabilities sum to 1`, rec);
  }
  // 3
  const idle = [...model.tasks.values()].find((t) => !t.span && t.proj === pid && (t.status === "TK_Complete" || t.type === "TT_Mile" || t.type === "TT_FinMile"));
  if (idle) {
    const plain = riskAnalysis(xer, { model, projId: pid, iterations: RUNS, seed: SEED });
    const withB = riskAnalysis(xer, { model, projId: pid, iterations: RUNS, seed: SEED, branches: [{ id: "G", branches: [{ name: "a", probability: 0.5, codes: [idle.code] }] }] });
    ok(JSON.stringify(plain.percentiles) === JSON.stringify(withB.percentiles), `3: percentiles moved by a branch on ${idle.code}`, rec);
    rec.idle = idle.code;
  }
  rec.seconds = Math.round((Date.now() - t0) / 100) / 10;
  out.push(rec);
  console.log(`${label}: ${rec.picks.length} picks of ${path.length} not-started driving activities, ${rec.checks} checks, ${rec.failures.length} failed (${rec.seconds} s)${rec.failures.length ? "\n  " + rec.failures.join("\n  ") : ""}`);
}
console.log(`\n${pass} of ${pass + fail} checks hold`);
if (val("--json")) writeFileSync(val("--json"), JSON.stringify({ seed: SEED, runs: RUNS, picks: PICKS, files: out }, null, 2) + "\n");
process.exit(fail ? 1 : 0);
