// P6 XML files P6 itself wrote (public samples): read each with pmxml.mjs,
// recompute the schedule, and count the open activities whose early start,
// early finish and late finish equal the dates P6 stored at its last run
// (RemainingEarly/Late dates). Files P6 never scheduled (no stored late
// dates) are listed with what was read.
//
//   node eval/pmxml-p6-dates.mjs <files...> [--json out.json]
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { parsePmxml } from "../pmxml.mjs";
import { schedule } from "../cpm.mjs";
import { parseDate, formatDate } from "../xer.mjs";

const args = process.argv.slice(2);
const jsonOut = args.includes("--json") ? args[args.indexOf("--json") + 1] : null;
const files = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--json");
const out = [];
for (const f of files) {
  const x = parsePmxml(readFileSync(f, "utf8"));
  const s = schedule(x);
  let n = 0, es = 0, ef = 0, lf = 0, all = 0;
  const bad = [];
  for (const t of s.model.tasks.values()) {
    if (t.span || t.status === "TK_Complete") continue;
    const r = s.tasks.get(t.id), row = t.row;
    if (!r || !row.early_end_date || !row.late_end_date) continue;
    n++;
    const oES = parseDate(row.early_start_date) === r.remES, oEF = parseDate(row.early_end_date) === r.ef, oLF = parseDate(row.late_end_date) === r.lf;
    es += oES; ef += oEF; lf += oLF;
    if (oES && oEF && oLF) all++; else if (bad.length < 5) bad.push(`${t.code}: EF ${row.early_end_date} vs ${formatDate(r.ef)}, LF ${row.late_end_date} vs ${formatDate(r.lf)}`);
  }
  const T = x.tables;
  const R = { file: basename(f), version: x.version, projects: (T.PROJECT || []).length, activities: (T.TASK || []).length, links: (T.TASKPRED || []).length, calendars: (T.CALENDAR || []).length, assignments: (T.TASKRSRC || []).length, scheduledByP6: n, es, ef, lf, all, bad, warnings: [...x.warnings, ...s.warnings].slice(0, 6) };
  out.push(R);
  console.log(`${R.file} (P6 ${R.version || "?"}): ${R.projects} project(s), ${R.activities} activities, ${R.links} links, ${R.calendars} calendars, ${R.assignments} assignments; ${n ? `open activities P6 scheduled ${n}: ES ${es}, EF ${ef}, LF ${lf}, all three ${all}` : "no stored late dates (P6 did not schedule it, or the file was written by another tool)"}${bad.length ? `\n    ${bad.join("\n    ")}` : ""}`);
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 1));
