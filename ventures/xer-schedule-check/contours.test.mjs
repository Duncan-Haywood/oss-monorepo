import { test } from "node:test";
import assert from "node:assert/strict";
import { PROJECT_CONTOURS, contourSlices, contourCurveValues, contourSpanFactor, contourName } from "./contours.mjs";
import { Calendar } from "./calendar.mjs";
import { parseDate } from "./xer.mjs";
import { curvePartBefore, readCurves } from "./curves.mjs";

test("the seven built-in contours: ten segments, slices sum to 1, curve values to 100", () => {
  assert.deepEqual(Object.keys(PROJECT_CONTOURS), ["1", "2", "3", "4", "5", "6", "7"]);
  for (const n of Object.keys(PROJECT_CONTOURS)) {
    assert.equal(PROJECT_CONTOURS[n].pct.length, 10);
    const s = contourSlices(n);
    assert.equal(s.length, 20);
    assert.ok(Math.abs(s.reduce((a, b) => a + b, 0) - 1) < 1e-12, n);
    const v = contourCurveValues(n);
    assert.equal(v.length, 21);
    assert.equal(v[0], 0);
    assert.ok(Math.abs(v.reduce((a, b) => a + b, 0) - 100) < 1e-9, n);
  }
  assert.equal(contourSlices("0"), null, "flat is even: no curve");
  assert.equal(contourSlices("8"), null, "contoured (hand-edited) has no fixed shape");
  assert.equal(contourName(6), "Bell");
});

test("span factor: Project stretches a contoured assignment to work / (units x mean)", () => {
  // the corpus: 80 h at 100% spans 133.33 h back loaded, 160 h bell, 114.28 h turtle
  assert.ok(Math.abs(80 * contourSpanFactor(1) - 133.333) < 0.001);
  assert.ok(Math.abs(80 * contourSpanFactor(6) - 160) < 1e-9);
  assert.ok(Math.abs(80 * contourSpanFactor(7) - 114.286) < 0.001);
  assert.equal(contourSpanFactor(0), 1);
});

test("back loaded 80 h spread as Project's own timephased rows (mspditimephasedsegments.xml, assignment 22)", () => {
  // Project: 0.8 h on Mon 7 Feb 2011, 0.5333 h to Tue 14:20 (first segment
  // 10%), then 1.2 h to Wed 14:20 (15%); span 08:00 Mon 7 Feb to 14:20 Tue 1 Mar
  const cal = Calendar.weekdays(8);
  const s = parseDate("2011-02-07 08:00"), e = parseDate("2011-03-01 14:20");
  assert.equal(cal.workBetween(s, e), 8000);
  const sl = contourSlices(1);
  const at = (d) => curvePartBefore(cal, s, e, 80, sl, parseDate(d));
  assert.ok(Math.abs(at("2011-02-08 08:00") - 0.8) < 1e-9);
  assert.ok(Math.abs(at("2011-02-08 14:20") - 1.3333) < 1e-4);
  assert.ok(Math.abs(at("2011-02-09 14:20") - 2.5333) < 1e-4);
  // the last segment (the last 13 h 20 min: all of Mon 28 Feb and Tue 1 Mar
  // to 14:20) works at 100%: 8 h on the Monday
  assert.ok(Math.abs(at("2011-03-01 08:00") - at("2011-02-28 08:00") - 8) < 1e-9);
  assert.ok(Math.abs(at("2011-03-01 14:20") - 80) < 1e-9);
});

test("a written curve reads back through curves.mjs as the same shape", () => {
  const v = contourCurveValues(3);
  const f = ["curv_id", "curv_name", "default_flag", ...v.map((_, k) => `pct_usage_${k}`)];
  const x = { tables: { RSRCCURVDATA: [Object.fromEntries(f.map((k, i) => [k, i === 0 ? "1" : i === 1 ? "MS Project Double Peak" : i === 2 ? "N" : String(v[i - 3])]))] } };
  const c = readCurves(x).get("1");
  const want = contourSlices(3);
  for (let k = 0; k < 20; k++) assert.ok(Math.abs(c.slices[k] - want[k]) < 1e-6, k);
});

test("every contour's percentages are Project's measured shape (eval/work-contours-2026-11-21.json)", async () => {
  const { readFileSync } = await import("node:fs");
  const m = JSON.parse(readFileSync(new URL("./eval/work-contours-2026-11-21.json", import.meta.url), "utf8"));
  const seen = new Set();
  for (const a of m.assignments) {
    const c = PROJECT_CONTOURS[a.wc];
    assert.equal(c.name, a.contour, `${a.file} ${a.uid}`);
    a.shape.forEach((v, k) => { if (v !== null) assert.ok(Math.abs(c.pct[k] - v) < 0.5, `${a.contour} segment ${k}: table ${c.pct[k]}, measured ${v}`); });
    seen.add(String(a.wc));
  }
  assert.deepEqual([...seen].sort(), Object.keys(PROJECT_CONTOURS), "the measurement covers all seven contours");
});

test("a WorkContour named after an Object.prototype key is unknown, not a crash", () => {
  for (const odd of ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"]) {
    assert.equal(contourName(odd), null, odd);
    assert.equal(contourSlices(odd), null, odd);
    assert.equal(contourCurveValues(odd), null, odd);
    assert.equal(contourSpanFactor(odd), 1, odd);
  }
});
