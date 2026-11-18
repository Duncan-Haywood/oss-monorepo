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

test("DRS exemption is the Article 50 one: 80 percent in 2026 plus a plan (audit 2026-11-17)", () => {
  const drs = run({ category: "beverage", role: "producer", location: "eu" }).timeline.find((t) => t.id === "drs");
  assert.doesNotMatch(drs.label, /90 percent separate-collection rate is already met/);
  assert.match(drs.label, /80 percent in 2026/);
});

test("a done marker of \"false\" or \"no\" is not done", () => {
  for (const v of ["false", "no", "0", ""]) assert.equal(run({ epr: v }).timeline.find((t) => t.id === "epr").done, false, v);
  assert.equal(run({ epr: "1" }).timeline.find((t) => t.id === "epr").done, true);
});

// 2026-11-17 quality audit, defects 0, 2, 3, 5, 6 (portfolio/quality/audits/2026-11-17-eu-packaging-regulation-checker.json).
test("reuse targets reach e-commerce packaging and the online sellers and fulfilment providers who use it", () => {
  const r = run({});
  const reuse = r.timeline.find((t) => t.id === "reuse");
  assert.ok(reuse, "the worked example (non-EU seller, plastic mailers) carries the reuse duty");
  assert.equal(reuse.from, "2030-01-01");
  assert.match(reuse.label, /40 percent/);
  assert.match(reuse.label, /10 percent of grouped/);
  assert.ok(ids(run({ role: "fulfilment", location: "eu" })).includes("reuse"));
  assert.ok(ids(run({ category: "transport", material: "wood", role: "distributor", location: "eu" })).includes("reuse"));
});

test("cardboard boxes are outside the reuse targets", () => {
  assert.ok(!ids(run({ category: "transport", material: "paper", role: "producer", location: "eu" })).includes("reuse"));
  assert.ok(!ids(run({ category: "ecommerce", material: "paper" })).includes("reuse"));
});

test("deposit return covers plastic bottles and metal cans, not glass", () => {
  const b = { category: "beverage", role: "producer", location: "eu" };
  assert.ok(ids(run({ ...b, material: "metal" })).includes("drs"));
  assert.ok(!ids(run({ ...b, material: "glass" })).includes("drs"));
  assert.ok(!ids(run({ ...b, material: "paper" })).includes("drs"));
});

test("label, recycled-content and empty-space dates move with the Commission act", () => {
  const r = run({ role: "producer", location: "eu", today: "2030-06-01" });
  const by = Object.fromEntries(r.timeline.map((t) => [t.id, t]));
  for (const id of ["label", "recycled", "emptyspace"]) {
    assert.equal(by[id].state, "pending", id);
    assert.ok(by[id].laterOf, id);
  }
  assert.equal(by.recyclable.state, "applies");
  assert.ok(r.findings.some((f) => f.title.includes("Check whether the act is in force")));
  assert.match(summaryText(r), /date set by a Commission act/);
});

test("unknown option values are rejected; blank takes the default", () => {
  assert.ok(run({ micro: "maybe" }).errors.some((e) => e.includes("Microenterprise")));
  assert.ok(run({ sellsEu: "perhaps" }).errors.some((e) => e.includes("Sells")));
  assert.ok(run({ euOperator: "x" }).errors.some((e) => e.includes("operator")));
  assert.ok(!run({ micro: "" }).errors);
  assert.ok(run({ epr: "false" }).open.some((t) => t.id === "epr"));
});
