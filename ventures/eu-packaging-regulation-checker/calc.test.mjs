import { test } from "node:test";
import assert from "node:assert/strict";
import { CATEGORIES, ROLES, classify, responsible, compute, daysUntil, SAMPLE, summaryText, timelineCsv } from "./calc.mjs";

const cat = (id) => CATEGORIES.find((c) => c.id === id);
const role = (id) => ROLES.find((r) => r.id === id);
const run = (o) => compute({ ...SAMPLE, today: "2026-10-13", ...o });
const ids = (r) => r.timeline.map((t) => t.id);

test("packaging sold into the EU is in scope; no packaging is not", () => {
  assert.equal(classify({ category: cat("plastic"), sellsEu: "yes" }).status, "in");
  assert.equal(classify({ category: cat("none"), sellsEu: "yes" }).status, "out");
  assert.equal(classify({ category: cat("plastic"), sellsEu: "no" }).status, "out");
});

test("daysUntil counts calendar days", () => {
  assert.equal(daysUntil("2030-01-01", "2026-10-13"), 1176);
  assert.equal(daysUntil("2026-08-12", "2026-10-13"), -62);
});

test("e-commerce packaging gets the empty space rule but not recycled content", () => {
  const r = run({ category: "ecommerce", role: "manufacturer", location: "eu" });
  for (const id of ["substances", "epr", "label", "recyclable", "minimise"]) assert.ok(ids(r).includes(id), id);
  assert.ok(!ids(r).includes("recycled"));
});

test("plastic and food-contact packaging get recycled content and the restricted formats", () => {
  for (const c of ["plastic", "food"]) {
    const r = run({ category: c, role: "importer", location: "eu" });
    assert.ok(ids(r).includes("recycled"), c);
    assert.ok(ids(r).includes("formats"), c);
  }
});

test("compostable items get the 2028 compostable duty only", () => {
  const r = run({ category: "compostable", role: "manufacturer", location: "eu" });
  assert.ok(ids(r).includes("compostable"));
  assert.ok(!ids(r).includes("recyclable"));
  assert.equal(r.timeline.find((t) => t.id === "compostable").from, "2028-02-12");
});

test("a distributor gets the substance and format duties but not registration", () => {
  const r = run({ category: "plastic", role: "distributor", location: "eu" });
  assert.deepEqual(ids(r).sort(), ["formats", "substances"]);
});

test("timeline is sorted by date", () => {
  const dated = run({ category: "food", role: "manufacturer", location: "eu" }).timeline.map((t) => t.from);
  assert.deepEqual(dated, [...dated].sort());
});

test("state follows the reference date", () => {
  const by = (today) => Object.fromEntries(run({ category: "plastic", role: "manufacturer", location: "eu", today }).timeline.map((t) => [t.id, t.state]));
  assert.equal(by("2026-10-13").substances, "applies");
  assert.equal(by("2026-10-13").recyclable, "later");
  assert.equal(by("2029-06-01").recyclable, "soon");
  assert.equal(by("2030-01-02").recyclable, "applies");
});

test("marking a duty done removes it from the open list", () => {
  assert.ok(run({ conformity: "" }).open.some((t) => t.id === "conformity"));
  assert.ok(!run({ conformity: "1" }).open.some((t) => t.id === "conformity"));
});

test("operator gap for a non-EU seller", () => {
  assert.equal(responsible({ role: role("importer"), location: "noneu", euOperator: "no" }).status, "gap");
  assert.equal(responsible({ role: role("distance"), location: "noneu", euOperator: "unsure" }).status, "unknown");
  assert.equal(responsible({ role: role("distance"), location: "noneu", euOperator: "yes" }).status, "covered");
  assert.equal(responsible({ role: role("manufacturer"), location: "eu", euOperator: "no" }).status, "self");
});

test("bad input is rejected, not clamped", () => {
  assert.ok(compute({}).errors.length >= 3);
  assert.ok(run({ today: "13/10/2026" }).errors[0].includes("YYYY-MM-DD"));
  assert.ok(run({ today: "2026-13-45" }).errors);
});

test("out of scope result has no timeline", () => {
  const r = run({ category: "none" });
  assert.equal(r.timeline.length, 0);
  assert.equal(r.findings[0].severity, "info");
});

test("summary and CSV render the timeline", () => {
  const r = run({});
  assert.match(summaryText(r), /Timeline:/);
  assert.match(summaryText(r), /not legal advice/);
  const csv = timelineCsv(r).split("\n");
  assert.equal(csv.length, r.timeline.length + 1);
  assert.match(csv[0], /applies_from/);
});

test("sample runs and flags overdue duties as high", () => {
  const r = run({});
  assert.ok(r.overdue.length > 0);
  assert.equal(r.findings[0].severity, "high");
});
