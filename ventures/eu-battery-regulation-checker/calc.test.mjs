import { test } from "node:test";
import assert from "node:assert/strict";
import { CATEGORIES, ROLES, classify, responsible, compute, daysUntil, SAMPLE, summaryText, timelineCsv } from "./calc.mjs";

const cat = (id) => CATEGORIES.find((c) => c.id === id);
const role = (id) => ROLES.find((r) => r.id === id);
const run = (o) => compute({ ...SAMPLE, today: "2026-10-13", ...o });
const ids = (r) => r.timeline.map((t) => t.id);

test("batteries sold into the EU are in scope; military, space, none are not", () => {
  assert.equal(classify({ category: cat("ev"), sellsEu: "yes" }).status, "in");
  assert.equal(classify({ category: cat("exempt"), sellsEu: "yes" }).status, "out");
  assert.equal(classify({ category: cat("none"), sellsEu: "yes" }).status, "out");
  assert.equal(classify({ category: cat("ev"), sellsEu: "no" }).status, "out");
});

test("daysUntil counts calendar days", () => {
  assert.equal(daysUntil("2027-02-18", "2026-10-13"), 128);
  assert.equal(daysUntil("2026-08-18", "2026-10-13"), -56);
});

test("an e-bike battery gets passport, QR, removability and label; not recycled content", () => {
  const r = run({ category: "lmt", role: "manufacturer", location: "eu" });
  for (const id of ["label", "passport", "qr", "removable", "carbon"]) assert.ok(ids(r).includes(id), id);
  assert.ok(!ids(r).includes("recycled"));
});

test("a portable battery gets no passport and no QR", () => {
  const r = run({ category: "portable", role: "manufacturer", location: "eu" });
  assert.ok(!ids(r).includes("passport"));
  assert.ok(!ids(r).includes("qr"));
  assert.ok(ids(r).includes("removable"));
});

test("due diligence only reaches firms that are not SMEs, and sorts by date", () => {
  assert.ok(!ids(run({ sme: "yes" })).includes("diligence"));
  const big = run({ sme: "no" });
  assert.ok(ids(big).includes("diligence"));
  const dated = big.timeline.filter((t) => t.from).map((t) => t.from);
  assert.deepEqual(dated, [...dated].sort());
});

test("state follows the reference date", () => {
  const r = run({ category: "ev", role: "manufacturer", location: "eu" });
  const by = Object.fromEntries(r.timeline.map((t) => [t.id, t.state]));
  assert.equal(by.substances, "applies");
  assert.equal(by.label, "applies");
  assert.equal(by.passport, "soon");
  assert.equal(by.recycled, "later");
  assert.equal(by.carbon, "pending");
  assert.equal(run({ category: "ev", role: "manufacturer", location: "eu", today: "2027-03-01" }).timeline.find((t) => t.id === "passport").state, "applies");
});

test("marking a duty done removes it from the open list", () => {
  const before = run({ conformity: "" });
  const after = run({ conformity: "1" });
  assert.ok(before.open.some((t) => t.id === "conformity"));
  assert.ok(!after.open.some((t) => t.id === "conformity"));
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
  const r = run({ category: "exempt" });
  assert.equal(r.timeline.length, 0);
  assert.equal(r.findings[0].severity, "info");
});

test("summary and CSV render the timeline", () => {
  const r = run({});
  const s = summaryText(r);
  assert.match(s, /Timeline:/);
  assert.match(s, /not legal advice/);
  const csv = timelineCsv(r).split("\n");
  assert.equal(csv.length, r.timeline.length + 1);
  assert.match(csv[0], /applies_from/);
});

test("sample runs and flags overdue duties as high", () => {
  const r = run({});
  assert.ok(r.overdue.length > 0);
  assert.equal(r.findings[0].severity, "high");
});
