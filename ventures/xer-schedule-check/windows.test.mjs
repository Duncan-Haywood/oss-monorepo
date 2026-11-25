import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXer, parseDate } from "./xer.mjs";
import { EXAMPLE_XER, EXAMPLE_PREV_XER } from "./example.mjs";
import { exampleSeries } from "./example-series.mjs";
import { statusAsPlanned } from "./status.mjs";
import { schedule } from "./cpm.mjs";
import { compare, halfStepXer } from "./compare.mjs";
import { windows, windowsText, windowsCsv } from "./windows.mjs";

const finish = (x) => schedule(x).projects.get("77").finish;

test("statusing as planned leaves the forecast finish where it was", () => {
  const apr = parseXer(EXAMPLE_XER);
  const may = statusAsPlanned(apr, "77", parseDate("2026-05-04 07:00"));
  assert.equal(finish(may), finish(apr));
  const t = (code) => may.tables.TASK.find((r) => r.task_code === code);
  assert.equal(t("A1050").status_code, "TK_Complete"); // demolition L1 was due before May
  assert.equal(may.tables.PROJECT[0].last_recalc_date, "2026-05-04 07:00");
  // a planted slip on driving-path work moves the finish by that much
  const slipped = statusAsPlanned(apr, "77", parseDate("2026-05-04 07:00"), { slips: [{ code: "A1080", hours: 16 }] });
  assert.ok(finish(slipped) >= finish(apr));
});

test("a re-estimate on work not yet started is a revision in the half-step, not progress", () => {
  const prev = parseXer(EXAMPLE_PREV_XER), cur = parseXer(EXAMPLE_XER);
  const h = halfStepXer(prev, cur, "77", "77");
  const t = (x, code) => x.tables.TASK.find((r) => r.task_code === code);
  // A1040 is not started in both; its remaining duration went 320 -> 400 h
  assert.equal(t(h, "A1040").remain_drtn_hr_cnt, t(prev, "A1040").remain_drtn_hr_cnt);
  // A1030 started this month: its remaining duration is progress
  assert.equal(t(h, "A1030").remain_drtn_hr_cnt, t(cur, "A1030").remain_drtn_hr_cnt);
});

test("windows sort by data date, split each window and add up", () => {
  const series = exampleSeries();
  const rep = windows([series[2], series[0], series[3], series[1]]);
  assert.deepEqual(rep.updates.map((u) => u.label), ["March update", "April update", "May update", "June update"]);
  assert.equal(rep.windows.length, 3);
  for (const w of rep.windows) assert.equal(Math.round((w.progressEffect + w.revisionEffect) * 10) / 10, w.moved);
  assert.equal(rep.total.sumOfWindows, rep.total.moved);
  const [w1, w2, w3] = rep.windows;
  // the first window is the example pair compare.mjs is tested on
  const c = compare(series[0].xer, series[1].xer);
  assert.equal(w1.moved, c.finish.moved);
  assert.equal(w1.progressEffect, c.finish.progressEffect);
  // May: paint re-estimated 8 -> 11 days, a revision of +3
  assert.deepEqual([w2.moved, w2.progressEffect, w2.revisionEffect], [3, 0, 3]);
  assert.ok(w2.drivers.revisions.some((d) => d.code === "A1150"));
  // June: board and tape L1 ran 4 days long, progress +4
  assert.deepEqual([w3.moved, w3.progressEffect, w3.revisionEffect], [4, 4, 0]);
  assert.ok(w3.drivers.progress.some((d) => d.code === "A1120"));
  assert.ok(rep.recurring.some((r) => r.code === "A1120" && r.windows.includes(3)));
});

test("text and CSV carry every window", () => {
  const rep = windows(exampleSeries());
  const text = windowsText(rep);
  assert.match(text, /windows add to \+22/);
  assert.match(text, /Window 3: May update to June update, finish \+4 \(progress \+4, revisions 0\)/);
  const csv = windowsCsv(rep);
  assert.equal(csv.split("\n").filter((l) => /^\d+,/.test(l) && l.includes(",window,")).length, 3);
  assert.match(csv, /revision,A1150,Paint/);
});

test("fewer than two updates is refused, and a repeated data date is warned about", () => {
  assert.throws(() => windows([exampleSeries()[0]]), /at least two/);
  const s = exampleSeries();
  const rep = windows([s[1], { ...s[1], label: "April again" }]);
  assert.ok(rep.warnings.some((w) => /same data date/.test(w)));
  assert.equal(rep.windows[0].moved, 0);
});

test("a gain on the driving path is named, and kept out of where the job lost time", () => {
  // found by eval/windows-kinds-check.mjs: work under way that went faster than
  // forecast pulled the finish in but no driver was named for it
  const apr = parseXer(EXAMPLE_XER);
  const dd = parseDate("2026-07-01 07:00"); // A1160 (on the path) under way, 3 days left
  const jul = statusAsPlanned(apr, "77", dd);
  const path = new Set(compare(apr, jul).criticalPath.previous);
  const row = jul.tables.TASK.find((r) => r.proj_id === "77" && r.status_code === "TK_Active" && path.has(r.task_code) && +r.remain_drtn_hr_cnt >= 16);
  assert.ok(row, "the example has work under way on the driving path in May");
  const gained = structuredClone(jul);
  const g = gained.tables.TASK.find((r) => r.task_id === row.task_id);
  g.remain_drtn_hr_cnt = String(+g.remain_drtn_hr_cnt - 8);
  const rep = windows([{ xer: apr, label: "April" }, { xer: gained, label: "July" }]);
  const [w] = rep.windows;
  assert.equal(w.revisionEffect, 0);
  assert.ok(w.progressEffect < 0, `progress ${w.progressEffect}`);
  const d = w.drivers.progress.find((x) => x.code === row.task_code);
  assert.ok(d && d.gain, JSON.stringify(w.drivers.progress));
  assert.match(d.what, /ahead of the forecast/);
  assert.ok(!rep.recurring.some((r) => r.code === row.task_code));
});

test("one project throughout: no project-ID warning; a wrong ID is warned about per update", () => {
  const s = exampleSeries();
  assert.deepEqual(windows(s).warnings, []);
  const named = windows(s, { projectName: "NOPE" }).warnings.filter((w) => /holds no project with ID NOPE; used OFFICE-FITOUT/.test(w));
  assert.equal(named.length, s.length);
});

test("windows that do not add up on the last calendar are warned about", () => {
  // the last update moves the project onto a 10 h day: its window and the
  // whole-series total are measured on it, the earlier windows on 8 h days
  const s = exampleSeries();
  const last = structuredClone(s[3]);
  last.xer.tables.CALENDAR.push({ ...last.xer.tables.CALENDAR[0], clndr_id: "99", clndr_name: "10 h day", day_hr_cnt: "10", default_flag: "N" });
  last.xer.tables.PROJECT[0].clndr_id = "99";
  const rep = windows([s[0], s[1], s[2], last]);
  assert.notEqual(rep.total.moved, rep.total.sumOfWindows);
  assert.ok(rep.warnings.some((w) => /windows add to .* the updates' project calendars differ/.test(w)), JSON.stringify(rep.warnings));
});

test("work under way on the driving path that slipped one day is named", () => {
  const apr = parseXer(EXAMPLE_XER);
  const jul = statusAsPlanned(apr, "77", parseDate("2026-07-01 07:00"));
  const path = new Set(compare(apr, jul).criticalPath.previous);
  const row = jul.tables.TASK.find((r) => r.proj_id === "77" && r.status_code === "TK_Active" && path.has(r.task_code) && +r.remain_drtn_hr_cnt >= 16);
  const slow = structuredClone(jul);
  const g = slow.tables.TASK.find((r) => r.task_id === row.task_id);
  g.remain_drtn_hr_cnt = String(+g.remain_drtn_hr_cnt + 8);
  const [w] = windows([{ xer: apr, label: "April" }, { xer: slow, label: "July" }]).windows;
  assert.equal(w.moved, 1);
  const d = w.drivers.progress.find((x) => x.code === row.task_code);
  assert.ok(d, JSON.stringify(w.drivers.progress));
  assert.match(d.what, /in progress, forecast finish .*\(\+1 working days\)/);
});
