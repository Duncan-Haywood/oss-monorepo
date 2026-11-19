// node eval/level-check.mjs <dir with .xer files> [--json out.json]
// Checks level.mjs on real P6 exports:
//  1. self-check: hours over a limit while a levelled (moved or placed,
//     not started, not listed as unfittable) activity uses the resource: 0
//  2. logic: every zero-lag FS, SS and FF link between unfinished activities
//     still holds in the levelled dates (independent of cpm.mjs's code)
//  3. nothing starts before its unlevelled early start
//  4. with every limit multiplied by 1e6 the levelled dates equal the CPM
//     dates on every activity (the levelling path itself changes nothing)
//  5. limits x1, x2, x4: the finish each crew size gives
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { decodeXer, parseXer } from "../xer.mjs";
import { level } from "../level.mjs";
import { schedule, buildModel } from "../cpm.mjs";

const dir = process.argv[2];
const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.xer$/i.test(f) && !/fixture\.xer|planted/.test(f)) files.push(p); } };
walk(dir);
const out = [];
for (const f of files.sort()) {
  const xer = parseXer(decodeXer(readFileSync(f)));
  const model = buildModel(xer);
  const t0 = Date.now();
  const r = level(xer, { model });
  const ms = Date.now() - t0;
  const name = f.split("/").pop();
  const base = schedule(xer, { model });
  const lv = r.result.tasks;
  let links = 0, broken = 0, early = 0;
  for (const rel of model.rels) {
    if (rel.external || rel.lag !== 0) continue;
    const p = model.tasks.get(rel.predId), s = model.tasks.get(rel.succId);
    if (p.span || s.span || p.status !== "TK_NotStart" || s.status !== "TK_NotStart") continue;
    const a = lv.get(rel.predId), b = lv.get(rel.succId);
    if (!a || !b) continue;
    links++;
    const ok = rel.type === "PR_FS" ? b.es >= a.ef : rel.type === "PR_SS" ? b.es >= a.es : rel.type === "PR_FF" ? b.ef >= a.ef : true;
    if (!ok) broken++;
  }
  for (const [id, b] of base.tasks) {
    const t = model.tasks.get(id), a = lv.get(id);
    if (t.status === "TK_NotStart" && a && (a.remES ?? a.es) < (b.remES ?? b.es)) early++;
  }
  const big = level(xer, { model, limitScale: { "*": 1e6 } });
  let same = 0, n = 0;
  for (const [id, b] of base.tasks) {
    const a = big.result.tasks.get(id);
    if (!a || model.tasks.get(id).status === "TK_Complete") continue;
    n++;
    if (a.es === b.es && a.ef === b.ef) same++;
  }
  const crews = [];
  for (const k of [2, 4]) {
    const q = level(xer, { model, limitScale: { "*": k } });
    crews.push({ scale: k, finish: q.levelledFinish, extensionDays: q.extensionDays });
  }
  const row = {
    file: name, project: r.project.code, resources: r.resources.length, levelledActivities: r.resources.reduce((x, y) => x + y.activities, 0),
    finish: r.finish, levelledFinish: r.levelledFinish, extensionDays: r.extensionDays, lowerBound: r.lowerBound,
    moved: r.activities.length, left: r.left.length, passes: r.passes, ms,
    selfCheckHours: r.resources.reduce((x, y) => x + y.selfCheckHours, 0),
    overHoursBefore: Math.round(r.resources.reduce((x, y) => x + y.before.overHours, 0)), overHoursAfter: Math.round(r.resources.reduce((x, y) => x + y.after.overHours, 0)),
    zeroLagLinks: links, brokenLinks: broken, startedEarlier: early,
    unlimitedEqualsCpm: `${same} of ${n}`, crews, warnings: r.warnings,
  };
  out.push(row);
  console.log(`${name}: ${row.project} ${row.resources} resources; finish ${row.finish} -> ${row.levelledFinish} (+${row.extensionDays} d; bound ${row.lowerBound?.date ?? "-"}); moved ${row.moved}, left ${row.left}; self-check ${row.selfCheckHours} h; over-limit hours ${row.overHoursBefore} -> ${row.overHoursAfter}; links ${links - broken}/${links} hold; started earlier ${early}; x1e6 = CPM ${row.unlimitedEqualsCpm}; x2 ${crews[0].finish} x4 ${crews[1].finish}; ${ms} ms`);
}
const j = process.argv.indexOf("--json");
if (j > 0) writeFileSync(process.argv[j + 1], JSON.stringify(out, null, 2) + "\n");
