import { test } from "node:test";
import assert from "node:assert/strict";
import { CATEGORIES, ROLES, classify, responsible, compute, daysUntil, SAMPLE, summaryText, timelineCsv } from "./calc.mjs";

const role = (id) => ROLES.find((r) => r.id === id);
const cat = (id) => CATEGORIES.find((c) => c.id === id);
const run = (o) => compute({ ...SAMPLE, today: "2026-10-13", ...o });
const ids = (r) => r.timeline.map((t) => t.id);

test("packaging sold into the EU is in scope; none or no EU sales is not", () => {
  assert.equal(classify({ category: cat("sales"), sellsEu: "yes" }).status, "in");
  assert.equal(classify({ category: cat("none"), sellsEu: "yes" }).status, "out");
  assert.equal(classify({ category: cat("sales"), sellsEu: "no" }).status, "out");
});

test("daysUntil counts calendar days", () => {
  assert.equal(daysUntil("2030-01-01", "2026-10-13"), 1176);
  assert.equal(daysUntil("2026-08-12", "2026-10-13"), -62);
});

test("an online seller of plastic mailers gets EPR and empty space, not the drinks deposit or design duties", () => {
  const r = run({});
  for (const id of ["epr", "emptyspace", "substances"]) assert.ok(ids(r).includes(id), id);
  assert.ok(!ids(r).includes("drs"));
  assert.ok(!ids(r).includes("fulfilment"));
});

test("recycled-content duty needs a plastic layer", () => {
  assert.ok(!ids(run({ material: "paper", role: "producer", location: "eu" })).includes("recycled"));
  assert.ok(ids(run({ material: "multi", role: "producer", location: "eu" })).includes("recycled"));
});

test("drinks containers pick up the deposit-return duty for producers", () => {
  const r = run({ category: "beverage", role: "producer", location: "eu", material: "plastic" });
  assert.ok(ids(r).includes("drs"));
});

test("reuse targets skip microenterprises and only reach transport packaging", () => {
  assert.ok(ids(run({ category: "transport", role: "producer", micro: "no" })).includes("reuse"));
  assert.ok(!ids(run({ category: "transport", role: "producer", micro: "yes" })).includes("reuse"));
  assert.ok(!ids(run({ category: "sales", role: "producer", micro: "no" })).includes("reuse"));
});

test("fulfilment providers get the registration-check duty", () => {
  assert.ok(ids(run({ role: "fulfilment", location: "eu" })).includes("fulfilment"));
});

test("timeline is sorted by date and state follows the reference date", () => {
  const r = run({ role: "producer", location: "eu" });
  const dated = r.timeline.map((t) => t.from);
  assert.deepEqual(dated, [...dated].sort());
  const by = Object.fromEntries(r.timeline.map((t) => [t.id, t.state]));
  assert.equal(by.epr, "applies");
  assert.equal(by.label, "later");
  assert.equal(run({ role: "producer", today: "2028-03-01" }).timeline.find((t) => t.id === "label").state, "soon");
});

test("marking a duty done removes it from the open list", () => {
  assert.ok(run({ epr: "" }).open.some((t) => t.id === "epr"));
  assert.ok(!run({ epr: "1" }).open.some((t) => t.id === "epr"));
});

test("operator gap for a non-EU online seller", () => {
  assert.equal(responsible({ role: role("distance"), location: "noneu", euOperator: "no" }).status, "gap");
  assert.equal(responsible({ role: role("distance"), location: "noneu", euOperator: "unsure" }).status, "unknown");
  assert.equal(responsible({ role: role("distance"), location: "noneu", euOperator: "yes" }).status, "covered");
  assert.equal(responsible({ role: role("producer"), location: "eu", euOperator: "no" }).status, "self");
  assert.equal(responsible({ role: role("distance"), location: "eu", euOperator: "no" }).status, "check");
});

test("bad input is rejected, not clamped", () => {
  assert.ok(compute({}).errors.length >= 3);
  assert.ok(run({ today: "13/10/2026" }).errors[0].includes("YYYY-MM-DD"));
  assert.ok(run({ material: "" }).errors[0].includes("material"));
  assert.ok(run({ today: "2026-13-45" }).errors);
});

test("out of scope result has no timeline and needs no material", () => {
  const r = run({ category: "none", material: "" });
  assert.equal(r.timeline.length, 0);
  assert.equal(r.findings[0].severity, "info");
});

test("summary and CSV render the timeline and admit dates are from memory", () => {
  const r = run({});
  const s = summaryText(r);
  assert.match(s, /Timeline:/);
  assert.match(s, /not legal advice/);
  assert.match(s, /from memory/);
  const csv = timelineCsv(r).split("\n");
  assert.equal(csv.length, r.timeline.length + 1);
});

test("sample runs and flags overdue duties as high plus the operator gap", () => {
  const r = run({});
  assert.ok(r.overdue.length > 0);
  assert.equal(r.findings[0].severity, "high");
  assert.ok(r.findings.some((f) => /No EU operator/.test(f.title)));
});
