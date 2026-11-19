// Risk register events (risk.mjs `risks`) on real P6 files.
//
//   node eval/risk-register-check.mjs <dir-or-files...> [--planted 40] [--runs 300] [--json out.json]
//
// Per file:
// (1) planted events: --planted activities picked by a seeded draw among the
//     open, non-milestone activities of the project, each given a certain
//     event (probability 1) with a fixed delay of 1 to 40 working days. With a
//     zero-width duration range every run must give exactly the finish the CPM
//     engine gives with that delay added to that activity directly (cpm.mjs's
//     `delay` option, the critical path test's code path), and the event's
//     finish must not move when the delay is under the activity's total float.
// (2) common random numbers: with the default range, a register must leave
//     the run without the events identical to a run with no register at all.
// (3) an illustrative three-event register on the activities the forecast's
//     own driving path starts, ends and is longest on (not a real register;
//     the files carry none): the events' P80 contingency, their ranking, and
//     the time a register adds.
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { parseXer, decodeXer } from "../xer.mjs";
import { schedule, buildModel, drivingPath } from "../cpm.mjs";
import { riskAnalysis, rng } from "../risk.mjs";

const args = process.argv.slice(2);
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
const planted = Number(opt("--planted") || 40);
const runs = Number(opt("--runs") || 300);
const files = [];
for (const a of args.filter((a, i) => !a.startsWith("--") && !["--planted", "--runs", "--json"].includes(args[i - 1]))) {
  if (statSync(a).isDirectory()) for (const f of readdirSync(a).sort()) { if (/\.xer$/i.test(f)) files.push(join(a, f)); }
  else files.push(a);
}
const zero = { min: 1, likely: 1, max: 1 };
const out = [];
for (const f of files) {
  const xer = parseXer(decodeXer(readFileSync(f)));
  const model = buildModel(xer);
  const base = riskAnalysis(xer, { iterations: 10, range: zero, model });
  const pid = base.project.id;
  const full = schedule(xer, { model });
  const open = [...model.tasks.values()].filter((t) => t.proj === pid && !t.span && t.status !== "TK_Complete" && t.type !== "TT_Mile" && t.type !== "TT_FinMile" && full.tasks.get(t.id));
  const rand = rng(11);
  const picks = [];
  const pool = open.slice();
  while (picks.length < Math.min(planted, pool.length)) picks.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  let exact = 0, floatHeld = 0, underFloat = 0, moved = 0;
  const misses = [];
  for (const [k, t] of picks.entries()) {
    const days = 1 + Math.floor(rng(100 + k)() * 40);
    const r = riskAnalysis(xer, { iterations: 10, range: zero, model, risks: [{ id: `P${k}`, probability: 1, min: days, likely: days, max: days, codes: [t.code] }] });
    const want = schedule(xer, { model, forwardOnly: true, delay: { taskId: t.id, minutes: days * (t.cal.hoursPerDay || 8) * 60 } }).projects.get(pid).finish;
    const ok = r.percentiles.every((q) => q.date === want);
    if (ok) exact++; else misses.push({ code: t.code, days, got: r.percentiles[0].date, want });
    const tf = full.tasks.get(t.id).tf; // hours, on the activity's calendar
    const dm = days * (t.cal.hoursPerDay || 8) * 60;
    if (tf !== null && tf !== undefined && dm < tf * 60) { underFloat++; if (r.percentiles[0].date === base.project.finish) floatHeld++; }
    if (r.percentiles[0].date !== base.project.finish) moved++;
  }
  // (2) and (3)
  const t0 = Date.now();
  const plain = riskAnalysis(xer, { iterations: runs, model });
  const msPlain = Date.now() - t0;
  const path = drivingPath(schedule(xer, { model, forwardOnly: true }), pid).map((id) => model.tasks.get(id)).filter((t) => t.type !== "TT_Mile" && t.type !== "TT_FinMile");
  const longest = path.slice().sort((a, b) => b.remain - a.remain)[0];
  const offPath = open.filter((t) => !path.includes(t)).sort((a, b) => (full.tasks.get(a.id).tf ?? 0) - (full.tasks.get(b.id).tf ?? 0)).find((t) => (full.tasks.get(t.id).tf ?? 0) > 0);
  const register = [
    { id: "late design (path start)", probability: 0.3, min: 5, likely: 10, max: 20, codes: [path.at(-1)?.code].filter(Boolean) },
    { id: "rework (longest on path)", probability: 0.15, min: 10, likely: 15, max: 30, codes: [longest?.code].filter(Boolean) },
    { id: "supplier (near-critical)", probability: 0.5, min: 2, likely: 5, max: 15, codes: [offPath?.code].filter(Boolean) },
  ].filter((r) => r.codes.length);
  const t1 = Date.now();
  const withR = riskAnalysis(xer, { iterations: runs, model, risks: register });
  const msRisk = Date.now() - t1;
  const crnSame = JSON.stringify(withR.withoutRisks.percentiles) === JSON.stringify(plain.percentiles) && withR.withoutRisks.pDeterministic === plain.pDeterministic;
  const p80 = (x) => x.percentiles.find((q) => q.p === 80).days;
  const row = {
    file: basename(f), openNonMilestone: open.length,
    planted: picks.length, plantedExact: exact, plantedMoved: moved, underFloat, underFloatHeld: floatHeld, misses: misses.slice(0, 5),
    crnSame, p80Without: p80(withR.withoutRisks), p80With: p80(withR), p80Contingency: Math.round((p80(withR) - p80(withR.withoutRisks)) * 10) / 10,
    eventDelay: withR.withoutRisks.eventDelay,
    events: withR.risks.map((k) => ({ id: k.id, target: k.targets[0], occurred: k.occurred, finishShift: k.finishShift, noise: k.shiftNoise, notNoise: k.notNoise })),
    nearCriticalFloatDays: offPath ? Math.round((full.tasks.get(offPath.id).tf / (offPath.cal.hoursPerDay || 8)) * 10) / 10 : null,
    seconds: { plain: msPlain / 1000, withRegister: msRisk / 1000 },
  };
  out.push(row);
  console.log(JSON.stringify(row));
}
if (opt("--json")) writeFileSync(opt("--json"), JSON.stringify({ planted, runs, files: out }, null, 2) + "\n");
console.log("DONE");
