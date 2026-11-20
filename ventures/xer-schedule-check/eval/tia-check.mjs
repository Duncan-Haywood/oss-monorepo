// Check the time impact analysis (tia.mjs) on real P6 exports.
//
//   node eval/tia-check.mjs <dir-or-files...> [--plants 20] [--seed 1] [--json out.json]
//
// No public job publishes its fragnets, so they are planted (seeded) on each
// file's main project, and each result is checked against an answer reached
// another way:
//
// 1. A null fragnet. A zero-day milestone inserted between two open
//    activities already linked finish-to-start with no lag, all three on the
//    project calendar: nothing may move. The finish must not change and no
//    activity may lose float.
// 2. Float. An open activity on the project calendar made d working days
//    longer (d from 1 to 40): the finish must move by max(0, d - (its total
//    float - the least total float in the project)), the float the activity
//    has over the driving path (the float of the activity that finishes
//    last; not the least in the file, which a constrained chain can hold).
//    Checked on activities in the predecessor cone of the activity the
//    finish rests on; relative float leaves out constraints and other open
//    ends, so a miss names where those hold the delay back. Activities with an
//    FF/SF predecessor or only SS/SF successors are left out (tia.mjs warns
//    about both: added days there move the start, or nothing after it).
// 2b. Days added to a milestone (which has no duration) are refused with a
//    warning and move nothing.
// 3. Two routes to the same delay. An open activity A whose only successor
//    in the network is B, by a finish-to-start link with no lag, both on the
//    project calendar: a new d-day activity inserted between A and B must
//    move the finish, every milestone and B's start exactly as making A
//    d days longer does.
// 4. The impacted XER. Every fragnet of check 3, written out with xerText()
//    (the download a scheduler imports into P6), read back and scheduled
//    again: the same finish.
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { parseXer, decodeXer, xerText, formatDate } from "../xer.mjs";
import { schedule, buildModel, drivingPath } from "../cpm.mjs";
import { pickProject } from "../compare.mjs";
import { timeImpact } from "../tia.mjs";
import { finishActivity, targetBound, floatAgainst } from "../floatpaths.mjs";

const args = process.argv.slice(2);
const val = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const plants = Number(val("--plants", 20));
let seed = Number(val("--seed", 1));
const jsonOut = val("--json", null);
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed / 2147483648);
const pick = (arr, n) => { const a = [...arr]; const out = []; while (a.length && out.length < n) out.push(a.splice(Math.floor(rnd() * a.length), 1)[0]); return out; };
const files = [];
for (const a of args.filter((a, i) => !a.startsWith("--") && !["--plants", "--seed", "--json"].includes(args[i - 1]))) {
  if (statSync(a).isDirectory()) for (const f of readdirSync(a).sort()) { if (/\.xer$/i.test(f)) files.push(join(a, f)); }
  else files.push(a);
}

const report = [];
const tot = { c1: [0, 0], c2: [0, 0], c2b: [0, 0], c3: [0, 0], c4: [0, 0] };
for (const file of files) {
  const t0 = Date.now();
  const xer = parseXer(decodeXer(readFileSync(file)));
  const model = buildModel(xer);
  const base = schedule(null, { model });
  const p = pickProject(xer, model, null);
  const pcal = p.cal;
  const hpd = pcal.hoursPerDay || 8;
  const open = [...model.tasks.values()].filter((t) => t.proj === p.id && !t.span && t.status !== "TK_Complete" && base.tasks.get(t.id) && Number.isFinite(base.tasks.get(t.id).tf));
  const onPcal = (t) => t.cal === pcal;
  // the float of the work that finishes last (the driving path's), not the
  // least in the file: a chain held by its own finish-on-or-before date can
  // carry far less float without driving the project finish
  const dp = drivingPath(base, p.id);
  const tfMin = dp.length ? base.tasks.get(dp[dp.length - 1]).tf : Math.min(...open.map((t) => base.tasks.get(t.id).tf));
  const inNet = (id) => { const t = model.tasks.get(id); return t && !t.span; };
  const fs0 = (rel) => rel.type === "PR_FS" && rel.lag === 0 && !rel.external;
  const r = { file: basename(file), project: p.code, open: open.length, c1: [], c2: [], c2b: [], c3: [], c4: [] };

  // 1. null fragnet
  const pairs = [];
  for (const a of open) if (onPcal(a)) for (const rel of a.succs) { const b = model.tasks.get(rel.succId); if (fs0(rel) && b && !b.span && b.status !== "TK_Complete" && onPcal(b) && b.proj === p.id) pairs.push([a, b]); }
  for (const [a, b] of pick(pairs, plants)) {
    const res = timeImpact(xer, `Activity ID,Name,Duration,Predecessors,Successors\nTIA-NULL,Null,0,${a.code},${b.code}\n`, { projId: p.id });
    const ok = res.finish.delayDays === 0 && res.consumed.length === 0;
    r.c1.push({ a: a.code, b: b.code, ok, delay: res.finish.delayDays, lessFloat: res.consumed.length });
  }

  // 2. float: relative float against the activity the finish rests on
  // (floatpaths.mjs: a backward pass from it over its predecessors alone,
  // no constraint or other finish), for activities in its predecessor cone
  const fin = finishActivity(base, p.id);
  const bound = fin ? targetBound(base, fin.id, base.tasks.get(fin.id).ef) : new Map();
  const isMs = (t) => t.type === "TT_Mile" || t.type === "TT_FinMile";
  // an FF or SF predecessor holds the finish, so days added move the start
  // earlier instead (tia.mjs warns); left out of checks 2 and 3
  const finHeld = (t) => t.preds.some((rel) => rel.type === "PR_FF" || rel.type === "PR_SF");
  // successors tied only at the start (SS/SF) do not wait for the finish, so
  // added days reach nothing after it (tia.mjs warns): left out too
  const startOnly = (t) => { const n = t.succs.filter((rel) => inNet(rel.succId)); return n.length > 0 && n.every((rel) => rel.type === "PR_SS" || rel.type === "PR_SF"); };
  for (const x of pick(open.filter((t) => onPcal(t) && !isMs(t) && !finHeld(t) && !startOnly(t) && bound.has(t.id)), plants)) {
    const d = 1 + Math.floor(rnd() * 40);
    const res = timeImpact(xer, `Activity ID,Duration\n${x.code},+${d}\n`, { projId: p.id });
    const rf = floatAgainst(base, x.id, bound.get(x.id));
    const expect = Math.round(Math.max(0, d - rf / hpd) * 10) / 10;
    const ok = Math.abs(res.finish.delayDays - expect) < 0.05;
    // for a miss: driving-path activities after the event on a calendar
    // other than the project's (a day worked or not worked there that the
    // project calendar counts differently), and constrained ones
    const byCode = new Map(open.map((t) => [String(t.code), t]));
    const path = res.drivingPath.map((c) => byCode.get(String(c))).filter(Boolean);
    const why = ok ? undefined : { pathOtherCalendar: path.filter((t) => t.cal !== pcal).length, pathConstrained: path.filter((t) => t.cstr.length).length, pathLength: path.length, absorbedByExpectedFinish: res.absorbed.length };
    r.c2.push({ code: x.code, why, d, relFloatDays: Math.round((rf / hpd) * 10) / 10, expect, got: res.finish.delayDays, ok });
  }
  // 2b. days added to a milestone are refused, with a warning, and move nothing
  for (const x of pick(open.filter(isMs), Math.min(3, plants))) {
    const res = timeImpact(xer, `Activity ID,Duration\n${x.code},+5\n`, { projId: p.id });
    r.c2b = r.c2b || [];
    r.c2b.push({ code: x.code, ok: res.finish.delayDays === 0 && res.extended.length === 0 && res.warnings.some((w) => /is a milestone/.test(w)) });
  }

  // 3 and 4. fragnet between A and B = A made longer
  const single = [];
  for (const a of open) {
    if (!onPcal(a) || isMs(a) || finHeld(a)) continue;
    const succs = a.succs.filter((rel) => inNet(rel.succId));
    if (succs.length !== 1 || !fs0(succs[0])) continue;
    const b = model.tasks.get(succs[0].succId);
    if (b.status === "TK_Complete" || !onPcal(b) || b.proj !== p.id) continue;
    single.push([a, b]);
  }
  for (const [a, b] of pick(single, plants)) {
    const d = 1 + Math.floor(rnd() * 30);
    const frag = timeImpact(xer, `Activity ID,Name,Duration,Predecessors,Successors\nTIA-F,Planted,${d},${a.code},${b.code}\n`, { projId: p.id });
    const ext = timeImpact(xer, `Activity ID,Duration\n${a.code},+${d}\n`, { projId: p.id });
    const bStart = (res) => res.consumed.find((c) => c.code === b.code)?.startAfter ?? null;
    const msSame = frag.milestones.every((m, i) => m.impacted === ext.milestones[i]?.impacted);
    const ok = frag.finish.impacted === ext.finish.impacted && msSame && bStart(frag) === bStart(ext);
    r.c3.push({ a: a.code, b: b.code, d, fragnet: frag.finish.delayDays, longer: ext.finish.delayDays, milestones: frag.milestones.length, ok });
    const back = schedule(parseXer(xerText(frag.impactedXer)));
    const f2 = formatDate(back.projects.get(p.id)?.finish ?? null);
    r.c4.push({ a: a.code, ok: f2 === frag.finish.impacted, got: f2, want: frag.finish.impacted });
  }
  for (const k of ["c1", "c2", "c2b", "c3", "c4"]) { tot[k][0] += r[k].filter((x) => x.ok).length; tot[k][1] += r[k].length; }
  r.seconds = (Date.now() - t0) / 1000;
  r.delays = { c2Moved: r.c2.filter((x) => x.got > 0).length, c3Moved: r.c3.filter((x) => x.fragnet > 0).length };
  report.push(r);
  const f = (k) => `${r[k].filter((x) => x.ok).length}/${r[k].length}`;
  console.log(`${r.file} (${p.code}, ${open.length} open): null ${f("c1")}, float ${f("c2")} (${r.delays.c2Moved} moved the finish), milestone refused ${f("c2b")}, fragnet = longer ${f("c3")} (${r.delays.c3Moved} moved), XER round trip ${f("c4")}; ${r.seconds.toFixed(1)} s`);
  for (const k of ["c1", "c2", "c2b", "c3", "c4"]) for (const x of r[k].filter((x) => !x.ok)) console.log(`  MISS ${k}: ${JSON.stringify(x)}`);
}
console.log(`TOTAL: null ${tot.c1.join("/")}, float ${tot.c2.join("/")}, milestone refused ${tot.c2b.join("/")}, fragnet = longer ${tot.c3.join("/")}, XER round trip ${tot.c4.join("/")}`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ seed: Number(val("--seed", 1)), plants, totals: tot, files: report }, null, 1));
