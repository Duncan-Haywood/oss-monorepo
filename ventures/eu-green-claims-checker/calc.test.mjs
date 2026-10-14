import { test } from "node:test";
import assert from "node:assert/strict";
import { CLAIMS, CLAIM_IDS, ROLES, AUDIENCES, APPLIES_FROM, scope, parse, compute, daysSince, SAMPLE, summaryText, claimsCsv } from "./calc.mjs";

const none = Object.fromEntries(CLAIM_IDS.map((id) => [id, ""]));
const run = (o) => compute({ role: "seller", audience: "eu", today: "2026-10-13", ...none, ...o });

test("only consumer-facing EU marketing is in scope", () => {
  assert.equal(scope({ audience: "eu" }).status, "in");
  assert.equal(scope({ audience: "b2b" }).status, "out");
  assert.equal(scope({ audience: "none" }).status, "out");
});

test("the date is 27 September 2026 and days count calendar days", () => {
  assert.equal(APPLIES_FROM, "2026-09-27");
  assert.equal(daysSince(APPLIES_FROM, "2026-10-13"), 16);
  assert.equal(daysSince(APPLIES_FROM, "2026-09-20"), -7);
});

test("claim ids are unique and every claim has a rule and a fix", () => {
  assert.equal(new Set(CLAIM_IDS).size, CLAIMS.length);
  for (const c of CLAIMS) { assert.ok(c.rule.length > 20, c.id); assert.ok(c.fix.length > 10, c.id); assert.ok(["banned", "conditional"].includes(c.kind), c.id); }
});

test("a generic claim is banned and counted high after the date", () => {
  const r = run({ generic: "1" });
  assert.equal(r.banned.length, 1);
  assert.equal(r.findings[0].severity, "high");
  assert.match(r.findings[0].title, /banned now/);
});

test("before the date the same claim is medium and counts down", () => {
  const r = run({ generic: "1", today: "2026-09-20" });
  assert.equal(r.findings[0].severity, "medium");
  assert.match(r.findings[0].title, /in 7 days/);
});

test("a future claim is conditional, not banned", () => {
  const r = run({ future: "1" });
  assert.equal(r.banned.length, 0);
  assert.equal(r.conditional.length, 1);
  assert.match(r.findings[0].title, /allowed only if a condition is met/);
});

test("no claims marked gives an info finding, not a clean bill of health", () => {
  const r = run({});
  assert.equal(r.hits.length, 0);
  assert.equal(r.findings[0].severity, "info");
  assert.match(r.findings[0].title, /not every misleading practice/);
});

test("B2B and no-EU results list nothing even when claims are marked", () => {
  for (const audience of ["b2b", "none"]) {
    const r = run({ audience, generic: "1" });
    assert.equal(r.hits.length, 0);
    assert.equal(r.findings[0].severity, "info");
  }
});

test("platform and agency roles add a role note", () => {
  assert.ok(run({ role: "marketplace" }).findings.some((f) => /platform/.test(f.title)));
  assert.ok(run({ role: "agency" }).findings.some((f) => /agency/.test(f.title)));
  assert.ok(!run({ role: "seller" }).findings.some((f) => /agency|platform/.test(f.title)));
});

test("bad input is rejected, not clamped", () => {
  assert.ok(compute({}).errors.length >= 2);
  assert.ok(run({ today: "13/10/2026" }).errors[0].includes("YYYY-MM-DD"));
  assert.ok(run({ audience: "mars" }).errors[0].includes("who you sell to"));
  assert.ok(run({ role: "" }).errors[0].includes("role"));
  assert.ok(parse({ role: "seller", audience: "eu", today: "2026-13-45" }).errors.length);
});

test("sample runs with banned claims and a future claim", () => {
  const r = compute({ ...SAMPLE, today: "2026-10-13" });
  assert.ok(!r.errors);
  assert.equal(r.banned.length, 3);
  assert.equal(r.conditional.length, 1);
});

test("summary and CSV render the claims and admit the list is from memory", () => {
  const r = compute({ ...SAMPLE, today: "2026-10-13" });
  const s = summaryText(r);
  assert.match(s, /BANNED/);
  assert.match(s, /not legal advice/);
  assert.match(s, /from memory/);
  assert.equal(claimsCsv(r).split("\n").length, r.hits.length + 1);
  assert.ok(Object.keys(AUDIENCES).length === 3 && ROLES.length === 4);
});
