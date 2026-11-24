// "Make open-ended activities critical" (sched_open_critical_flag) on the
// public XERs: none of them sets it, so this turns it on in a copy and
// measures what it does.
//
//   node eval/open-critical.mjs <dir-or-files...> [--json out.json]
//
// Per file: open activities with no successor (the open ends); how many
// open activities lose float when the option is on, and how many become
// critical (total float <= the file's critical threshold); that no early
// date moves and no float grows; and that with the option off the result is
// the one the engine gave before the option was applied (every task's dates
// and float equal).
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { parseXer, decodeXer } from "../xer.mjs";
import { schedule } from "../cpm.mjs";

const args = process.argv.slice(2);
const jsonOut = args.includes("--json") ? args[args.indexOf("--json") + 1] : null;
const files = [];
for (const a of args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--json")) {
  if (statSync(a).isDirectory()) for (const f of readdirSync(a).sort()) { if (/\.xer$/i.test(f)) files.push(join(a, f)); }
  else files.push(a);
}

const rows = [];
for (const f of files) {
  const text = decodeXer(new Uint8Array(readFileSync(f)));
  const withFlag = (v) => {
    const x = parseXer(text);
    for (const o of x.tables.SCHEDOPTIONS || []) o.sched_open_critical_flag = v;
    return x;
  };
  const x0 = parseXer(text);
  const stored = [...new Set((x0.tables.SCHEDOPTIONS || []).map((o) => o.sched_open_critical_flag))].join(",");
  const asFile = schedule(x0), off = schedule(withFlag("N")), on = schedule(withFlag("Y"));
  let open = 0, ends = 0, lost = 0, nowCrit = 0, critOff = 0, critOn = 0, moved = 0, grew = 0, offDiff = 0, lostHours = 0;
  for (const t of on.model.tasks.values()) {
    if (t.span || t.status === "TK_Complete") continue;
    const a = off.tasks.get(t.id), b = on.tasks.get(t.id), c = asFile.tasks.get(t.id);
    if (!a || !b || a.tf === undefined || b.tf === undefined) continue;
    open++;
    const p = on.projects.get(t.proj);
    const thr = (p && p.criticalHours) || 0;
    if (!t.succs.some((r) => !on.model.tasks.get(r.succId).span)) ends++;
    if (a.ef !== b.ef || a.remES !== b.remES) moved++;
    if (b.tf > a.tf + 1e-9) grew++;
    if (b.tf < a.tf - 1e-9) { lost++; lostHours += a.tf - b.tf; }
    if (a.tf <= thr) critOff++;
    if (b.tf <= thr) critOn++;
    if (a.tf > thr && b.tf <= thr) nowCrit++;
    if (c.ef !== a.ef || c.lf !== a.lf || Math.abs(c.tf - a.tf) > 1e-9) offDiff++;
  }
  rows.push({ file: basename(f), stored, open, openEnds: ends, loseFloat: lost, becomeCritical: nowCrit, criticalOff: critOff, criticalOn: critOn,
    floatLostDays: Math.round(lostHours / 8 * 10) / 10, earlyDatesMoved: moved, floatGrew: grew, asFileVsOff: offDiff });
}
const head = ["file", "stored", "open", "openEnds", "loseFloat", "becomeCritical", "criticalOff", "criticalOn", "floatLostDays", "earlyDatesMoved", "floatGrew", "asFileVsOff"];
console.log(head.join("\t"));
for (const r of rows) console.log(head.map((k) => r[k]).join("\t"));
const sum = (k) => rows.reduce((s, r) => s + r[k], 0);
console.log(["total", "", ...head.slice(2).map(sum)].join("\t"));
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(rows, null, 2) + "\n");
