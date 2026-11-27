import test from "node:test";
import assert from "node:assert/strict";
import { wallPanelReport, wallPanelText } from "./panels.mjs";

const base = { length: 480, height: "8ft", windows: 1, doors: 1, panelMax: 144, sheathPsf: 1.5 };

test("40 ft wall with a window and a door splits into 4 panels under 12 ft", () => {
  const r = wallPanelReport(base);
  assert.ok(r.ok);
  assert.equal(r.panels.length, 4);
  assert.ok(r.panels.every((p) => p.width <= 144));
  assert.ok(Math.abs(r.panels.reduce((t, p) => t + p.width, 0) - 480) < 1);
  assert.equal(r.totalLb, Math.round(r.panels.reduce((t, p) => t + p.totalLb, 0) * 10) / 10);
  assert.match(wallPanelText(r).at(-1), /^Total /);
});
test("no sheathing weight means sheathLb 0", () => {
  const r = wallPanelReport({ ...base, sheathPsf: 0 });
  assert.ok(r.panels.every((p) => p.sheathLb === 0 && p.totalLb === p.lb));
});
test("a short wall is one panel", () => {
  assert.equal(wallPanelReport({ ...base, length: 96, windows: 0, doors: 0 }).panels.length, 1);
});
test("refuses bad input", () => {
  for (const o of [{ ...base, height: "7ft" }, { ...base, length: 10 }, { ...base, windows: 1.5 }, { ...base, panelMax: 2 }, { ...base, sheathPsf: -1 }, { ...base, length: 100, windows: 5 }, null]) {
    assert.equal(wallPanelReport(o).ok, false);
  }
});
