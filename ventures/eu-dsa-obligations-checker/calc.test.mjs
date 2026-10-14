import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, summaryText, SAMPLE, VERIFY, category, isSmall, parse } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });
const arts = (r) => r.obligations.map((o) => o.art);

test("sample: a small public platform gets hosting duties and Art. 24(3) but not Arts. 20-28 or the report", () => {
  const r = run({});
  assert.equal(r.category, "platform");
  assert.ok(r.small);
  assert.ok(arts(r).includes("Art. 16"));
  assert.ok(arts(r).includes("Art. 24(3)"));
  for (const a of ["Art. 20", "Art. 21", "Art. 25", "Art. 15"]) assert.ok(!arts(r).includes(a), a);
});

test("a mid-size platform gets the full online platform set and the transparency report", () => {
  const r = run({ employees: 120, turnover: 40_000_000, assets: 30_000_000 });
  for (const a of ["Art. 15", "Art. 20", "Art. 21", "Art. 22", "Art. 23", "Art. 25", "Art. 26", "Art. 27", "Art. 28"]) assert.ok(arts(r).includes(a), a);
});

test("small test needs fewer than 50 staff and turnover or assets at most EUR 10M", () => {
  assert.ok(isSmall(parse({ ...SAMPLE, employees: 49, turnover: 10_000_000 })));
  assert.ok(!isSmall(parse({ ...SAMPLE, employees: 50, turnover: 1 })));
  assert.ok(!isSmall(parse({ ...SAMPLE, employees: 10, turnover: 10_000_001, assets: 10_000_001 })));
});

test("marketplace adds trader traceability unless small", () => {
  assert.ok(arts(run({ marketplace: "yes", employees: 200, turnover: 50_000_000, assets: 50_000_000 })).includes("Art. 30"));
  assert.ok(!arts(run({ marketplace: "yes" })).includes("Art. 30"));
  assert.equal(run({ marketplace: "yes" }).category, "marketplace");
});

test("45 million users makes a VLOP and removes the small exemption", () => {
  const r = run({ mau: 45_000_000 });
  assert.equal(r.category, "vlop");
  assert.ok(!r.small);
  for (const a of ["Art. 34", "Art. 37", "Art. 39", "Art. 20"]) assert.ok(arts(r).includes(a), a);
  assert.equal(category(parse({ ...SAMPLE, mau: 44_999_999 })), "platform");
});

test("search engines become VLOSE at the threshold and skip the ad repository", () => {
  const r = run({ type: "search", mau: 50_000_000 });
  assert.equal(r.category, "vlose");
  assert.ok(!arts(r).includes("Art. 39"));
  assert.ok(arts(r).includes("Art. 34"));
});

test("non-EU provider needs a legal representative", () => {
  assert.ok(arts(run({ euBased: "no" })).includes("Art. 13"));
  assert.ok(!arts(run({})).includes("Art. 13"));
});

test("conduit and cache carry baseline duties only", () => {
  const r = run({ type: "conduit" });
  assert.ok(!arts(r).includes("Art. 16"));
  assert.ok(arts(r).includes("Art. 11"));
});

test("ads and recommender duties appear only when relevant", () => {
  const r = run({ employees: 120, turnover: 40_000_000, ads: "no", recommender: "no" });
  assert.ok(!arts(r).includes("Art. 26"));
  assert.ok(!arts(r).includes("Art. 27"));
});

test("bad input is rejected, never clamped", () => {
  assert.ok(compute({}).errors.length);
  assert.ok(run({ mau: -1 }).errors.length);
  assert.ok(run({ employees: "many" }).errors.length);
});

test("summary lists the checklist and the verify source", () => {
  const s = summaryText(run({}));
  assert.match(s, /\[ \] Art\. 16/);
  assert.ok(s.includes(VERIFY));
});
