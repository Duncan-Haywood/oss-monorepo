// Expected finish dates ("use expected end dates") against P6's own dates.
//
//   node eval/expected-finish.mjs <dir-or-files...> [--json out.json]
//
// Three questions per file:
//  1. Which files turn the option on, and how many open activities store an
//     expected finish?
//  2. Rule check: throw away the stored remaining duration of every activity
//     the rule sets (expected finish after its remaining start) by adding
//     80 h to it, reschedule with the rule on and off, and count open
//     activities whose early finish, late finish and total float still equal
//     P6's. With the rule on, the remaining duration comes back from the
//     expected finish alone; with it off, the planted error shows.
//  3. What it hides: for each activity the rule sets, add 10 working days to
//     its latest-finishing open predecessor and see how far its own finish and
//     the project finish move, with the rule on (as P6 schedules this file)
//     and off.
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseXer, decodeXer, parseDate, num } from "../xer.mjs";
import { buildModel, schedule } from "../cpm.mjs";

const args = process.argv.slice(2);
const jsonOut = args.includes("--json") ? args[args.indexOf("--json") + 1] : null;
const files = [];
for (const a of args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--json")) {
  if (statSync(a).isDirectory()) for (const f of readdirSync(a).sort()) { if (/\.xer$/i.test(f)) files.push(join(a, f)); }
  else files.push(a);
}

function matches(out) {
  let n = 0, all = 0;
  for (const t of out.model.tasks.values()) {
    if (t.span || t.status === "TK_Complete") continue;
    const r = out.tasks.get(t.id);
    if (!r || r.lf === undefined || !t.row.early_end_date || !t.row.late_end_date) continue;
    n++;
    const pTF = num(t.row.total_float_hr_cnt);
    if (parseDate(t.row.early_end_date) === r.ef && parseDate(t.row.late_end_date) === r.lf && pTF !== null && Math.abs(pTF - r.tf) < 0.01) all++;
  }
  return { n, all };
}

const summary = [];
for (const f of files) {
  const xer = parseXer(decodeXer(readFileSync(f)));
  const model = buildModel(xer);
  const flag = [...model.projects.values()].some((p) => p.useExpectedFinish);
  const open = [...model.tasks.values()].filter((t) => !t.span && t.status !== "TK_Complete");
  const withExp = open.filter((t) => t.expEnd !== null);
  const s = { file: f.split("/").pop(), version: xer.version, option: flag, open: open.length, withExpected: withExp.length };
  summary.push(s);
  if (!flag || !withExp.length) {
    console.log(`${s.file} (P6 ${s.version}): option ${flag ? "on" : "off"}, ${withExp.length} open activities with an expected finish; nothing to check`);
    continue;
  }
  const base = schedule(xer, { model });
  const set = withExp.filter((t) => t.expEnd > base.tasks.get(t.id).remES);
  const ignored = withExp.filter((t) => !set.includes(t));
  // the stored remaining equals the time to the expected finish on every set one?
  s.storedEqualsRule = set.filter((t) => t.cal.workBetween(base.tasks.get(t.id).remES, t.expEnd) === t.remain).length;
  s.set = set.length;
  s.ignored = ignored.length;
  s.ignoredKeepStored = ignored.filter((t) => base.tasks.get(t.id).ef === parseDate(t.row.early_end_date)).length;
  s.base = matches(base);
  // 2. plant 80 h on every set activity's remaining duration
  const planted = buildModel(xer);
  for (const t of set) planted.tasks.get(t.id).remain += 80 * 60;
  s.plantedRuleOn = matches(schedule(xer, { model: planted }));
  s.plantedRuleOff = matches(schedule(xer, { model: planted, expectedFinish: false }));
  // 3. a 10-day slip on each set activity's latest-finishing open predecessor
  const off = schedule(xer, { model, expectedFinish: false });
  const proj = (out) => Math.max(...[...out.projects.values()].map((p) => p.finish ?? -Infinity));
  const slips = [];
  for (const t of set) {
    let pred = null;
    for (const r of t.preds) {
      const pt = model.tasks.get(r.predId);
      if (!pt || pt.span || pt.status === "TK_Complete" || pt.type === "TT_Mile" || pt.type === "TT_FinMile") continue;
      if (!pred || base.tasks.get(pt.id).ef > base.tasks.get(pred.id).ef) pred = pt;
    }
    if (!pred) continue;
    const minutes = 10 * (pred.cal.hoursPerDay || 8) * 60;
    const on = schedule(xer, { model, delay: { taskId: pred.id, minutes } });
    const without = schedule(xer, { model, expectedFinish: false, delay: { taskId: pred.id, minutes } });
    const days = (a, b) => (b >= a ? 1 : -1) * t.cal.workBetween(Math.min(a, b), Math.max(a, b)) / 60 / (t.cal.hoursPerDay || 8);
    slips.push({
      code: t.code, pred: pred.code,
      ownOn: Math.round(days(base.tasks.get(t.id).ef, on.tasks.get(t.id).ef) * 10) / 10,
      ownOff: Math.round(days(off.tasks.get(t.id).ef, without.tasks.get(t.id).ef) * 10) / 10,
      projectOn: Math.round(days(proj(base), proj(on)) * 10) / 10,
      projectOff: Math.round(days(proj(off), proj(without)) * 10) / 10,
    });
  }
  s.slips = slips;
  console.log(`${s.file} (P6 ${s.version}): option on; ${withExp.length} open activities with an expected finish: rule sets ${set.length} (stored remaining = time to it on ${s.storedEqualsRule}), ignores ${ignored.length} (stored dates kept on ${s.ignoredKeepStored})`);
  console.log(`  as stored: ${s.base.all}/${s.base.n} match P6; +80 h planted on the ${set.length}: rule on ${s.plantedRuleOn.all}/${s.plantedRuleOn.n}, rule off ${s.plantedRuleOff.all}/${s.plantedRuleOff.n}`);
  for (const x of slips) console.log(`  ${x.pred} +10 d: ${x.code} finish moves ${x.ownOn} d with its expected finish (${x.ownOff} d without); project finish ${x.projectOn} d (${x.projectOff} d without)`);
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(summary, null, 2) + "\n");
