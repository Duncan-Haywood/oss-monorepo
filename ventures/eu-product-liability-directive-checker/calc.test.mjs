import { test } from "node:test";
import assert from "node:assert/strict";
import { ROLES, KINDS, compute, statusOf, daysUntil, summaryText, SAMPLE, APPLIES_FROM } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });

test("daysUntil counts calendar days and goes negative after the date", () => {
  assert.equal(daysUntil("2026-10-14", "2026-10-13"), 1);
  assert.equal(daysUntil("2026-10-12", "2026-10-13"), -1);
  assert.equal(daysUntil("bad", "2026-10-13"), null);
});

test("statusOf separates applying, soon and later", () => {
  assert.equal(statusOf(APPLIES_FROM, "2027-01-01").state, "inforce");
  assert.equal(statusOf(APPLIES_FROM, "2026-10-13").state, "soon");
  assert.equal(statusOf(APPLIES_FROM, "2024-01-01").state, "later");
});

test("a commercial AI system placed after 9 Dec 2026 is in scope with high findings", () => {
  const r = run({});
  assert.equal(r.scope, "in");
  assert.ok(r.findings.some((f) => /updates/.test(f.title) && f.severity === "high"));
  assert.ok(r.findings.some((f) => /EU importer or authorised representative/.test(f.title)));
});

test("free open source outside commercial activity is out of scope", () => {
  const r = run({ kind: "software", licence: "oss_free" });
  assert.equal(r.scope, "out");
  assert.match(r.findings.map((f) => f.title).join(" "), /Donations/);
});

test("open source supplied commercially stays in scope", () => {
  assert.equal(run({ kind: "software", licence: "oss_commercial" }).scope, "in");
});

test("the open-source exemption does not apply to a physical product", () => {
  assert.equal(run({ kind: "physical", licence: "oss_free" }).scope, "in");
});

test("a pure service is out of scope and pointed to the component role", () => {
  const r = run({ kind: "service" });
  assert.equal(r.scope, "out");
  assert.match(r.findings.map((f) => f.title).join(" "), /component/);
});

test("units placed before the date stay under the old regime", () => {
  const r = run({ placed: "before" });
  assert.equal(r.scope, "old");
  assert.ok(!r.findings.some((f) => /Time limits/.test(f.title)));
});

test("unsure placement is treated as in scope with a warning", () => {
  const r = run({ placed: "unsure" });
  assert.equal(r.scope, "in");
  assert.ok(r.findings.some((f) => /not sure when a unit is placed/.test(f.title)));
});

test("each role gets its own liability line", () => {
  const seen = new Set();
  for (const role of ROLES) {
    const r = run({ role: role.id, kind: "physical", licence: "na", base: "eu" });
    const line = r.findings.find((f) => f.severity !== "info" && !/Timing|disclose/.test(f.title) && !/Time limits/.test(f.title));
    assert.ok(line, role.id);
    seen.add(line.title);
  }
  assert.equal(seen.size, ROLES.length);
});

test("distributors get the one-month rule", () => {
  assert.match(run({ role: "distributor", kind: "physical" }).findings.map((f) => f.title).join(" "), /one month/);
});

test("no update control still names the duty", () => {
  assert.match(run({ updates: "no" }).findings.map((f) => f.title).join(" "), /do not control updates/);
});

test("missing role or product kind is rejected", () => {
  assert.ok(compute({ role: "", kind: "ai" }).errors.length);
  assert.ok(compute({ role: "manufacturer", kind: "" }).errors.length);
  assert.ok(compute({ role: "nope", kind: "ai" }).errors.length);
  assert.ok(compute({ role: "manufacturer", kind: "nope" }).errors.length);
});

test("every option id is unique", () => {
  for (const list of [ROLES, KINDS]) assert.equal(new Set(list.map((x) => x.id)).size, list.length);
});

test("summary names the verify source and the not-legal-advice line", () => {
  const s = summaryText(run({}));
  assert.match(s, /Verify against: Directive \(EU\) 2024\/2853/);
  assert.match(s, /not legal advice/);
});
