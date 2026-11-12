// The page builds the roster in a Web Worker (roster-worker.mjs) and gets back the roster, staff and shifts in one
// structured-clone message. These tests stand in for the thread hop with structuredClone (the same algorithm
// postMessage uses) and check that every report the page draws from a roster reads the same from the clone.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { handle } from "./roster-worker.mjs";
import * as calc from "./calc.mjs";

const src = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const weeks = [["sample", calc.sampleStaff(), calc.sampleShifts()], ...Object.entries(calc.TEMPLATES).map(([k, t]) => [k, t.staff(), t.shifts()])];

test("the worker builds the same roster as a direct call, and says so when the build throws", () => {
  for (const [name, staffText, shiftsText] of weeks) {
    const st = calc.parseStaff(staffText), sh = calc.parseShifts(shiftsText);
    const direct = calc.buildRoster(st.staff, sh.slots, { exact: false });
    const out = handle({ id: 7, staff: st.staff, slots: sh.slots, options: { exact: false } });
    assert.equal(out.id, 7);
    const untimed = (r) => ({ ...r, timings: undefined }); // wall-clock milliseconds differ run to run
    assert.deepEqual(untimed(out.roster), untimed(direct), name);
  }
  const bad = handle({ id: 1, staff: null, slots: null, options: {} });
  assert.match(bad.roster.error, /could not be built/);
});

test("roster, staff and shifts survive one structured clone, and every page report reads the same from the copy", () => {
  for (const [name, staffText, shiftsText] of weeks) {
    const st = calc.parseStaff(staffText), sh = calc.parseShifts(shiftsText);
    const msg = handle({ id: 1, staff: st.staff, slots: sh.slots, options: {} });
    const copy = structuredClone(msg);
    assert.equal(JSON.stringify(copy), JSON.stringify(msg), name);
    const reports = (staff, slots, r) => {
      const t = slots.length > 1 ? 1 : 0;
      return JSON.stringify([
        calc.coverOptions(staff, slots, r, 0), calc.swapOptions(staff, slots, r, 0), calc.coverChain(staff, slots, r, 0, {}, { maxMoves: 3, limit: 5 }),
        calc.checkTrade(staff, slots, r, 0, t), calc.absencePlan(staff, slots, r, staff[0].name, null), calc.trimOptions(staff, slots, r),
        calc.scheduleFlags(r, { minDay: 4 }), calc.placeBreaks(r), calc.placeRestBreaks(r, { restEvery: 4, restMin: 10, mealAfter: 5, mealMin: 30 }),
        calc.unsupervisedStretches(r, staff), calc.loneStretches(r, 0), calc.shortShifts(r, 4), calc.seventhDayPay(r, {}), calc.seniorityClaims(staff, slots, r),
        calc.dailyLabor(r, staff, ""), calc.coverageGrid(r), calc.fairnessReport(r), calc.hoursThresholds(r, { threshold: 30 }), calc.tipPool(r, 500),
        calc.rosterCsv(r), calc.hoursCsv(r), calc.rosterIcs(r, "2026-11-16"), calc.rosterMessages(r, "2026-11-16"), calc.openShiftPost(staff, slots, r, "2026-11-16"),
        r.optimality ? calc.optimalityText(r.optimality) : null,
      ]);
    };
    assert.equal(reports(copy.staff, copy.slots, copy.roster), reports(st.staff, sh.slots, msg.roster), name);
  }
});

test("the worker file imports only calc.mjs and sends nothing anywhere", () => {
  const w = src("roster-worker.mjs");
  assert.deepEqual([...w.matchAll(/^\s*import\s.*?from\s+"([^"]+)"/gm)].map((m) => m[1]), ["./calc.mjs"]);
  assert.doesNotMatch(w, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts|import\(/);
});

test("the page builds in the worker, falls back to this thread, can stop a build, and honours the exact-check Off setting", () => {
  const html = src("index.html");
  assert.match(html, /new Worker\(new URL\("roster-worker\.mjs", location\.href\), \{ type: "module" \}\)/);
  assert.match(html, /function buildHere\(/);
  assert.match(html, /id="build-stop"[^>]*hidden/);
  // Before 2026-11-12 the main build ignored #prove (only the multi-week planner read it), so "Off" did nothing.
  const run = html.slice(html.indexOf("async function run()"), html.indexOf("function download("));
  assert.match(run, /\$\("#prove"\)\.value === "0" \? \{ exact: false \}/);
  assert.doesNotMatch(run, /buildRoster\(/, "the main build must go through buildInBackground");
});
