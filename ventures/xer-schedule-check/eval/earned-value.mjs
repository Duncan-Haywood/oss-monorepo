// Earned value (evm.mjs) on public P6 files: the figures, the cost-loading
// checks, whether the curves close (planned on the budget, forecast on the
// estimate at completion), and, where P6 computed actuals from progress, how
// often the percent complete evm.mjs reads gives back P6's own actual cost.
//
//   node eval/earned-value.mjs <dir-or-files...> [--json out.json]
//
// eval/earned-value-2026-11-20.md
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { decodeXer } from "../xer.mjs";
import { parseSchedule } from "../mspdi.mjs";
import { schedule } from "../cpm.mjs";
import { assess } from "../dcma.mjs";
import { earnedValue, percentComplete } from "../evm.mjs";

const args = process.argv.slice(2);
const jsonOut = args.includes("--json") ? args[args.indexOf("--json") + 1] : null;
const files = [];
for (const a of args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--json")) {
  if (statSync(a).isDirectory()) { for (const f of readdirSync(a)) if (/\.xer$/i.test(f)) files.push(join(a, f)); } else files.push(a);
}
const out = [];
for (const f of files.sort()) {
  const t0 = Date.now();
  const xer = parseSchedule(decodeXer(readFileSync(f)));
  const result = schedule(xer);
  const pid = assess(xer, { result }).project.id;
  const r = earnedValue(xer, { projId: pid, result });
  const ms = Date.now() - t0;
  const row = { file: f.split("/").pop(), measure: r.measure, currency: r.currency, ms };
  if (r.measure) {
    const t = r.totals;
    Object.assign(row, { bac: t.bac, pv: t.pv, ev: t.ev, ac: t.ac, eac: t.eac, spi: t.spi, cpi: t.cpi, spit: r.earnedSchedule?.spit ?? null, activities: r.activities.length });
    const last = r.curve.at(-1) || {};
    row.pvCloses = Math.abs((last.pv ?? 0) - t.bac) <= Math.max(0.05, 1e-9 * t.bac);
    row.fcCloses = last.forecast === null || last.forecast === undefined ? Math.abs((last.ac ?? 0) - t.eac) <= Math.max(0.05, 1e-9 * t.eac) : Math.abs(last.forecast - t.eac) <= Math.max(0.05, 1e-9 * t.eac);
    row.findings = Object.fromEntries(r.findings.map((x) => [x.id, x.count]));
    // percent complete against P6's computed actuals, by percent complete type:
    // per activity, actual / budget against evm's percent (0.1%)
    const T = xer.tables, rsrc = new Map();
    for (const a of T.TASKRSRC || []) {
      const v = rsrc.get(a.task_id) || { bac: 0, ac: 0 };
      v.bac += +a.target_cost || 0; v.ac += (+a.act_reg_cost || 0) + (+a.act_ot_cost || 0);
      rsrc.set(a.task_id, v);
    }
    const byType = {};
    for (const tk of T.TASK || []) {
      const v = rsrc.get(tk.task_id);
      if (!v || !(v.bac > 0) || !(v.ac > 0) || tk.proj_id !== pid) continue;
      const k = (byType[tk.complete_pct_type || "(none)"] ||= { n: 0, equal: 0 });
      k.n++;
      if (Math.abs(v.ac / v.bac - percentComplete(tk)) <= 0.001) k.equal++;
    }
    row.actualVsPercent = byType;
  } else row.note = r.notes.join(" ");
  out.push(row);
  console.log(JSON.stringify(row));
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 1) + "\n");
