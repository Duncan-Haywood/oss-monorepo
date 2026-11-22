// Project interim plans (Start/Finish pairs) on the way to P6: named, and
// left out on request (mspdi.mjs interimPairs, parseMspdi { interim, skipFields },
// p6xer.mjs, CLI --no-interim / --skip-fields). eval/interim-plans-2026-11-22.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseMspdi, interimPairs } from "./mspdi.mjs";
import { p6XerText, p6Problems } from "./p6xer.mjs";
import { parseXer } from "./xer.mjs";

const S1 = "188743732", F1 = "188743733", S2 = "188743735", F2 = "188743736", N1 = "188743767";
const ea = (id, v) => `<ExtendedAttribute><FieldID>${id}</FieldID><Value>${v}</Value></ExtendedAttribute>`;
const def = (id, name, alias = "") => `<ExtendedAttribute><FieldID>${id}</FieldID><FieldName>${name}</FieldName>${alias ? `<Alias>${alias}</Alias>` : ""}</ExtendedAttribute>`;
const DAYS = ["2024-03-04", "2024-03-05", "2024-03-06"];
const task = (uid, extra = "") => `<Task><UID>${uid}</UID><ID>${uid}</ID><Name>T${uid}</Name><OutlineLevel>1</OutlineLevel><Start>${DAYS[uid - 1]}T08:00:00</Start><Finish>${DAYS[uid - 1]}T17:00:00</Finish><Duration>PT8H0M0S</Duration>${extra}</Task>`;
const xml = (defs, tasks) => `<?xml version="1.0" encoding="UTF-8"?>
<Project xmlns="http://schemas.microsoft.com/project"><SaveVersion>14</SaveVersion><Name>t.xml</Name><StartDate>2024-03-04T08:00:00</StartDate><CalendarUID>1</CalendarUID><MinutesPerDay>480</MinutesPerDay>
<ExtendedAttributes>${defs}</ExtendedAttributes>
<Calendars><Calendar><UID>1</UID><Name>Standard</Name><IsBaseCalendar>1</IsBaseCalendar><WeekDays>${[1, 2, 3, 4, 5, 6, 7].map((d) => `<WeekDay><DayType>${d}</DayType><DayWorking>${d === 1 || d === 7 ? 0 : 1}</DayWorking>${d === 1 || d === 7 ? "" : "<WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes>"}</WeekDay>`).join("")}</WeekDays></Calendar></Calendars>
<Tasks><Task><UID>0</UID><ID>0</ID><Name>P</Name><OutlineLevel>0</OutlineLevel><Summary>1</Summary></Task>${tasks.join("")}</Tasks></Project>`;
// an interim plan in Start1/Finish1 (a copy of each task's dates) and a
// planner's own Number1
const interimFile = (defs = def(S1, "Start1") + def(F1, "Finish1") + def(N1, "Number1", "Crew")) => xml(defs, [1, 2, 3].map((u) => task(u, ea(S1, `${DAYS[u - 1]}T08:00:00`) + ea(F1, `${DAYS[u - 1]}T17:00:00`) + ea(N1, String(u)))));
const labels = (tables) => (tables.UDFTYPE || []).map((u) => u.udf_type_label).sort();

test("a Start/Finish pair copied from the tasks' own dates is named as an interim plan", () => {
  assert.deepEqual(interimPairs(interimFile()), [{ k: 1, start: "Start1", finish: "Finish1", tasks: 3, sameSpan: 3 }]);
  const r = parseMspdi(interimFile());
  assert.deepEqual(labels(r.tables), ["Crew", "Finish1", "Start1"]); // kept by default, as before
  assert.ok(r.warnings.some((w) => /look like a Project interim plan.*Start1\/Finish1 \(3 task\(s\), 3 with the task's own/.test(w)));
});

test("interim: skip leaves the pair out and keeps every other field", () => {
  const r = parseMspdi(interimFile(), { interim: "skip" });
  assert.deepEqual(labels(r.tables), ["Crew"]);
  assert.equal(r.tables.UDFVALUE.length, 3);
  assert.ok(r.warnings.some((w) => /interim plan\(s\) left out \(--no-interim\): Start1\/Finish1/.test(w)));
  const x = p6XerText(interimFile(), { interim: "skip" });
  assert.deepEqual(labels(x.xer.tables), ["Crew"]);
  assert.deepEqual(p6Problems(x.xer.tables), []);
  assert.deepEqual(labels(p6XerText(interimFile()).xer.tables), ["Crew", "Finish1", "Start1"]);
  assert.throws(() => parseMspdi(interimFile(), { interim: "drop" }), /interim must be "keep" or "skip"/);
});

test("aliased pairs, a lone Start field, a reversed pair and a one-task pair are not named", () => {
  assert.deepEqual(interimPairs(interimFile(def(S1, "Start1", "Permit start") + def(F1, "Finish1"))), []);
  assert.deepEqual(interimPairs(xml("", [1, 2, 3].map((u) => task(u, ea(S1, `${DAYS[u - 1]}T08:00:00`))))), []);
  const rev = xml("", [task(1, ea(S1, "2024-03-08T08:00:00") + ea(F1, "2024-03-04T17:00:00")), task(2, ea(S1, `${DAYS[1]}T08:00:00`) + ea(F1, `${DAYS[1]}T17:00:00`))]);
  assert.deepEqual(interimPairs(rev), []);
  assert.deepEqual(interimPairs(xml("", [task(1, ea(S1, `${DAYS[0]}T08:00:00`) + ea(F1, `${DAYS[0]}T17:00:00`)), task(2)])), []);
});

test("a plan set after the schedule moved is still named; sameSpan counts unchanged spans", () => {
  const moved = xml("", [1, 2, 3].map((u) => task(u, ea(S2, `2024-02-2${u}T08:00:00`) + ea(F2, u === 3 ? "2024-02-26T17:00:00" : `2024-02-2${u}T17:00:00`))));
  assert.deepEqual(interimPairs(moved), [{ k: 2, start: "Start2", finish: "Finish2", tasks: 3, sameSpan: 2 }]);
  // most tasks hold both, one only Start2: 2 of 3 is under 90%, not named
  const partial = xml("", [task(1, ea(S2, "2024-02-21T08:00:00") + ea(F2, "2024-02-21T17:00:00")), task(2, ea(S2, "2024-02-22T08:00:00") + ea(F2, "2024-02-22T17:00:00")), task(3, ea(S2, "2024-02-23T08:00:00"))]);
  assert.deepEqual(interimPairs(partial), []);
});

test("skipFields leaves named fields out whatever they hold, and names a field it does not know", () => {
  const r = parseMspdi(interimFile(), { skipFields: ["number1", "Finish1", "Text3"] });
  assert.deepEqual(labels(r.tables), ["Start1"]);
  assert.ok(r.warnings.some((w) => /--skip-fields: text3 not a Number, Cost, Date, Start or Finish field name/.test(w)));
});

test("CLI: --to-p6 with --no-interim and --skip-fields", () => {
  const dir = mkdtempSync(join(tmpdir(), "interim-"));
  const src = join(dir, "s.xml"), out = join(dir, "s.xer");
  writeFileSync(src, interimFile());
  const cli = join(import.meta.dirname, "cli.mjs");
  const text = execFileSync(process.execPath, [cli, src, "--to-p6", out, "--no-interim"]).toString();
  assert.match(text, /interim plan\(s\) left out/);
  assert.deepEqual(labels(parseXer(readFileSync(out, "latin1")).tables), ["Crew"]);
  execFileSync(process.execPath, [cli, src, "--to-p6", out, "--skip-fields", "Number1"]);
  assert.deepEqual(labels(parseXer(readFileSync(out, "latin1")).tables), ["Finish1", "Start1"]);
});
