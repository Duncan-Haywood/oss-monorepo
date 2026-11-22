import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXer, parseDate } from "./xer.mjs";
import { EXAMPLE_XER } from "./example.mjs";
import { exampleSeries } from "./example-series.mjs";
import { statusAsPlanned } from "./status.mjs";
import { trend, trendText, trendCsv } from "./trend.mjs";

test("the example series: finish moves add up, DCMA per update, BEI against the first update", () => {
  const r = trend(exampleSeries());
  assert.equal(r.project, "OFFICE-FITOUT");
  assert.equal(r.baseline, "March update");
  assert.deepEqual(r.updates.map((u) => u.label), ["March update", "April update", "May update", "June update"]);
  assert.deepEqual(r.updates.map((u) => u.finishMoved), [null, 15, 3, 4]);
  assert.equal(r.summary.finishMoved, 22);
  for (const u of r.updates) assert.equal(u.points.length, 14);
  // the first update is its own baseline: nothing it had due is missed
  assert.equal(r.updates[0].baselineExecution.missed, 0);
  // June: board and tape planted 4 days long, so its successors lose float
  // and go negative against the must-finish date
  const jun = r.updates[3];
  assert.equal(jun.negative, 5);
  assert.ok(jun.newlyFailing.some((n) => n.id === 7 && n.codes.includes("A1120")));
  const a1120 = r.erosion.find((e) => e.code === "A1120");
  assert.ok(a1120 && a1120.floatNow < 0 && a1120.cause !== "calendar");
  // still positive and falling: listed first, soonest to zero first
  const firstNeg = r.erosion.findIndex((e) => e.floatNow <= 0);
  assert.ok(firstNeg > 0);
  for (let i = 1; i < firstNeg; i++) assert.ok(r.erosion[i - 1].monthsToZero <= r.erosion[i].monthsToZero);
});

test("an as-planned series has no missed work, no finish move and no erosion from slipping", () => {
  const apr = parseXer(EXAMPLE_XER);
  const may = statusAsPlanned(apr, "77", parseDate("2026-05-04 07:00"));
  const jun = statusAsPlanned(may, "77", parseDate("2026-06-01 07:00"));
  const r = trend([{ xer: jun, label: "jun" }, { xer: apr, label: "apr" }, { xer: may, label: "may" }]);
  assert.deepEqual(r.updates.map((u) => u.label), ["apr", "may", "jun"]); // data-date order
  for (const u of r.updates) assert.equal(u.baselineExecution.missed, 0);
  assert.equal(r.summary.finishMoved, 0);
  assert.equal(r.erosion.filter((e) => e.finishLater > 0.05).length, 0);
});

test("a planted slip is a missed task against the first update once its baseline finish is due", () => {
  const apr = parseXer(EXAMPLE_XER);
  const may = statusAsPlanned(apr, "77", parseDate("2026-05-04 07:00"), { slips: [{ code: "A1080", hours: 40 }] });
  const r = trend([{ xer: apr, label: "apr" }, { xer: may, label: "may" }]);
  const m = r.updates[1].baselineExecution;
  assert.ok(m.missedItems.some((x) => x.code === "A1080"), JSON.stringify(m.missedItems));
  assert.ok(m.bei < 1);
});

test("text and CSV", () => {
  const r = trend(exampleSeries());
  const t = trendText(r);
  assert.match(t, /schedule health over 4 updates/);
  assert.match(t, /Float erosion/);
  const csv = trendCsv(r).trim().split("\n");
  assert.equal(csv.length, 5);
  assert.equal(csv[0].split(",").length, 15 + 28);
  assert.throws(() => trend([{ xer: parseXer(EXAMPLE_XER) }]), /at least two/);
});
