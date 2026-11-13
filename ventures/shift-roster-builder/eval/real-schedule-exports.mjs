// Real published-schedule exports (2026-11-13). Until today `--import-shifts` had read scheduler layouts only as
// made-up rows under headers written from memory, and it refused both real files below outright ("No start and end
// time columns found"). Both were found by GitHub code search on their header rows, in other people's public
// repositories. Both carry staff personal data (names; the Deputy file also birth dates, emails and phone numbers),
// so we neither commit them nor link them: this script takes local copies, checks each SHA-256 against the copy
// measured, and prints only counts, times and position names, never a person's field.
//   A: a retail store's week from a workforce-management tool, first-published and final shift side by side
//      ("Initial Shift Date ... Final Shift Worker Role"; found with the query "Initial Shift Date" extension:csv).
//   B: a Deputy timesheet export with the rostered shift beside the worked one ("Timesheet Start Time ...
//      Schedule Start Time ... Area Name ... Location Name"; found with "Schedule Start Time" "Area Name" headers).
//   node eval/real-schedule-exports.mjs A.csv B.csv   (output: eval/real-schedule-exports.out.txt)
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { importShiftsCsv } from "../import-shifts.mjs";
import { splitCsvRow, csvLines } from "../import-staff.mjs";
import { parseShifts } from "../calc.mjs";

const SHA = { A: "a4c7e371816c53c3f82b49749b5cc9a43a6693128da5d9608c7e6b28972468d0", B: "69c7946b3b53357b3435f10d967ef47f30a8a7b5f0ea5a874d3048d64ecc7e07" };
const [pa, pb] = process.argv.slice(2);
if (!pa || !pb) { console.error("usage: node eval/real-schedule-exports.mjs A.csv B.csv"); process.exit(2); }
const load = (p, k) => {
  const b = readFileSync(p); const got = createHash("sha256").update(b).digest("hex");
  if (got !== SHA[k]) { console.error(`${k}: SHA-256 ${got} is not the measured copy ${SHA[k]}`); process.exit(1); }
  return b.toString("utf8");
};
const A = load(pa, "A"), B = load(pb, "B");
const table = (t) => { const L = csvLines(t).filter((l) => l.trim()); const H = splitCsvRow(L[0], ",").map((h) => h.replace(/^﻿/, "")); return L.slice(1).map((l) => { const c = splitCsvRow(l, ","); return Object.fromEntries(H.map((h, i) => [h, c[i] || ""])); }); };
const mins = (t) => { const m = /^(\d{1,2}):(\d{2})/.exec(t); return m ? +m[1] * 60 + +m[2] : NaN; };
const len = (s, e) => { const a = mins(s), b = mins(e); return b > a ? b - a : b + 1440 - a; };
const pct = (k, n) => `${k} of ${n} (${n ? Math.round((100 * k) / n) : 0}%)`;
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN; };
const out = [];
const say = (...l) => out.push(...l);
const hoursByRole = (text) => { const m = new Map(); for (const s of parseShifts(text).slots) m.set(s.role || "(none)", (m.get(s.role || "(none)") || 0) + (s.end - s.start) / 60); return [...m].sort((a, b) => b[1] - a[1]).map(([r, h]) => `${r} ${h.toFixed(1)} h`).join("; "); };
const importLine = (label, r) => {
  say(`${label}: ${r.rows} rows read -> ${r.shifts} shift lines, ${parseShifts(r.shiftsText).slots.length} shifts, ${parseShifts(r.shiftsText).slots.reduce((h, s) => h + (s.end - s.start) / 60, 0).toFixed(1)} h a week; skipped ${r.skipped.length}`);
  say(`  parseShifts errors: ${parseShifts(r.shiftsText).errors.length}`);
  for (const n of r.notes) say(`  note: ${n.length > 220 ? n.slice(0, 220) + " ..." : n}`);
};

say("# A: retail store, first-published vs final week", "");
for (const use of [undefined, "initial"]) { const r = importShiftsCsv(A, { use }); importLine(`import (${use || "default"})`, r); say(`  hours by position: ${hoursByRole(r.shiftsText)}`, ""); }
const ra = table(A);
let newRole = 0, sameDate = 0;
const cls = { kept: 0, newTimes: 0, newPerson: 0, both: 0, removed: 0, added: 0, openInitial: 0, openFinal: 0 };
let hI = 0, hF = 0, iN = 0, fN = 0;
for (const r of ra) {
  const I = !!r["Initial Shift Date"], F = !!r["Final Shift Date"];
  if (I) { iN++; hI += len(r["Initial Shift Start Time"], r["Initial Shift End Time"]) / 60; if (!r["Initial TM Employee Id"]) cls.openInitial++; }
  if (F) { fN++; hF += len(r["Final Shift Start Time"], r["Final Shift End Time"]) / 60; if (!r["Final TM Employee Id"]) cls.openFinal++; }
  if (I && !F) cls.removed++;
  else if (!I && F) cls.added++;
  else if (I && F) {
    const sameT = r["Initial Shift Date"] === r["Final Shift Date"] && r["Initial Shift Start Time"] === r["Final Shift Start Time"] && r["Initial Shift End Time"] === r["Final Shift End Time"];
    const sameP = r["Initial TM Employee Id"] === r["Final TM Employee Id"];
    if (r["Initial Shift Work Role"] !== r["Final Shift Worker Role"]) newRole++;
    if (r["Initial Shift Date"] === r["Final Shift Date"]) sameDate++;
    cls[sameT && sameP ? "kept" : sameP ? "newTimes" : sameT ? "newPerson" : "both"]++;
  }
}
say(`rows ${ra.length}: first-published shifts ${iN} (${hI.toFixed(1)} h, ${cls.openInitial} with nobody on them), final shifts ${fN} (${hF.toFixed(1)} h, ${cls.openFinal} open)`);
say(`of the ${iN} first-published shifts: kept as published ${pct(cls.kept, iN)}; same person, new times ${pct(cls.newTimes, iN)}; same times, another person ${pct(cls.newPerson, iN)}; both changed ${pct(cls.both, iN)}; no final shift on that row ${pct(cls.removed, iN)} (${cls.openInitial} of them first published with nobody on them)`);
say(`rows with both: ${cls.kept + cls.newTimes + cls.newPerson + cls.both}; same date on both sides ${sameDate}, same person on both sides ${cls.kept + cls.newTimes}, so a row pairs one person's day; position changed on ${newRole}`);
say(`shifts in the final week that were not in the first: ${pct(cls.added, fN)}`);
say(`the file's own "Initial equals Final" column says Yes on ${ra.filter((r) => r["Initial equals Final"] === "Yes").length} rows`, "");

say("# B: Deputy timesheets with the rostered shift beside each", "");
for (const use of [undefined, "timesheet"]) importLine(`import (${use || "default"})`, importShiftsCsv(B, { use }));
const rb = table(B);
const top = importShiftsCsv(B).locations[0];
importLine(`import (busiest location only, ${top.rows} rows)`, importShiftsCsv(B, { location: top.name }));
say("");
const live = rb.filter((r) => r["Discarded"] !== "TRUE");
const leave = live.filter((r) => r["Is Leave"] === "TRUE");
const work = live.filter((r) => r["Is Leave"] !== "TRUE");
const both = work.filter((r) => r["Schedule Start Time"] && r["Timesheet Start Time"]);
const unrostered = work.filter((r) => !r["Schedule Start Time"]);
say(`rows ${rb.length}: discarded ${rb.length - live.length}; leave ${pct(leave.length, live.length)}; work rows ${work.length}, of which worked with no rostered shift ${pct(unrostered.length, work.length)}`);
const leaveTypes = new Map(); for (const r of leave) leaveTypes.set(r["Leave Type Name"] || "(blank)", (leaveTypes.get(r["Leave Type Name"] || "(blank)") || 0) + 1);
say(`leave types: ${[...leaveTypes].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ${n}`).join("; ")}`);
const wrap = (d) => (d > 720 ? d - 1440 : d < -720 ? d + 1440 : d);
const dS = both.map((r) => wrap(mins(r["Timesheet Start Time"]) - mins(r["Schedule Start Time"])));
const dE = both.map((r) => wrap(mins(r["Timesheet End Time"]) - mins(r["Schedule End Time"])));
const dH = both.map((r) => len(r["Timesheet Start Time"], r["Timesheet End Time"]) - len(r["Schedule Start Time"], r["Schedule End Time"]));
const within = (xs, m) => xs.filter((x) => Math.abs(x) <= m).length;
say(`rostered and worked both present: ${both.length}`);
say(`  start (worked - rostered, minutes): median ${median(dS)}; exactly on time ${pct(within(dS, 0), both.length)}; within 15 min ${pct(within(dS, 15), both.length)}; started over 15 min early ${dS.filter((x) => x < -15).length}, over 15 min late ${dS.filter((x) => x > 15).length}`);
say(`  end: median ${median(dE)}; exactly ${pct(within(dE, 0), both.length)}; within 15 min ${pct(within(dE, 15), both.length)}; left over 15 min early ${dE.filter((x) => x < -15).length}, stayed over 15 min late ${dE.filter((x) => x > 15).length}`);
const sumR = both.reduce((h, r) => h + len(r["Schedule Start Time"], r["Schedule End Time"]), 0) / 60, sumW = both.reduce((h, r) => h + len(r["Timesheet Start Time"], r["Timesheet End Time"]), 0) / 60;
say(`  span hours (before breaks): rostered ${sumR.toFixed(1)}, worked ${sumW.toFixed(1)} (${((100 * (sumW - sumR)) / sumR).toFixed(1)}%); per shift median ${median(dH)} min`);
say(`  locations ${importShiftsCsv(B).locations.length}; positions (Area Name) ${new Set(work.map((r) => r["Area Name"]).filter(Boolean)).size}`);
process.stdout.write(out.join("\n") + "\n");
