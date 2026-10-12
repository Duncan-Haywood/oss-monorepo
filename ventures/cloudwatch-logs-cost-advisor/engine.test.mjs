import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseGroups, analyze, summarize, groupCost, snapRetention, storageRemoved } from "./engine.mjs";

const text = readFileSync(new URL("./fixtures/groups.csv", import.meta.url), "utf8");
const by = (r) => Object.fromEntries(r.groups.map((g) => [g.name, g]));

test("parser maps headers, reads never as 0, skips bad rows", () => {
  const p = parseGroups("# c\nretention_days,log_group,stored_gb,ingested_gb_month\n7,/a,10,5\nnever,/b,1,1\n,/c,1,1\nx,/d,1,1\n/e,abc,1,1\n");
  assert.equal(p.rows.length, 3);
  assert.deepEqual(p.rows.map((r) => r.retention), [7, 0, 0]);
  assert.equal(p.skipped, 2);
});

test("costs are exact products of the price table; IA halves ingestion", () => {
  const c = groupCost({ storedGb: 100, ingestGb: 100, cls: "standard" });
  assert.ok(Math.abs(c.total - (50 + 3)) < 1e-9);
  assert.ok(Math.abs(groupCost({ storedGb: 0, ingestGb: 100, cls: "ia" }).total - 25) < 1e-9);
});

test("retention snaps up to a value CloudWatch accepts", () => {
  assert.equal(snapRetention(30), 30);
  assert.equal(snapRetention(31), 60);
  assert.equal(snapRetention(10), 14);
  assert.equal(snapRetention(99999), 3653);
});

test("storage removed scales with retention, or age for never-expire; unknown age is null", () => {
  assert.ok(Math.abs(storageRemoved({ retention: 365, storedGb: 365, ageDays: null }, 30) - 335) < 1e-9);
  assert.ok(Math.abs(storageRemoved({ retention: 0, storedGb: 100, ageDays: 100 }, 25) - 75) < 1e-9);
  assert.equal(storageRemoved({ retention: 0, storedGb: 100, ageDays: null }, 30), null);
  assert.equal(storageRemoved({ retention: 7, storedGb: 100, ageDays: null }, 30), 0);
});

test("fixture: never-expire and long retention are warned with commands; short retention is left alone", () => {
  const r = analyze(parseGroups(text));
  const g = by(r);
  assert.match(g["/aws/lambda/checkout-api"].command, /put-retention-policy --log-group-name \/aws\/lambda\/checkout-api --retention-in-days 30/);
  assert.ok(g["/aws/ecs/web-access"].saving > 20);
  assert.equal(g["/aws/eks/prod/application"].saving, 0);
  assert.ok(r.findings.some((f) => f.rule === "dead-group" && f.row === "/aws/lambda/old-etl"));
});

test("ingestion-dominates and ia-class-candidate fire on the big standard group; ia groups are not candidates", () => {
  const r = analyze(parseGroups(text));
  assert.ok(r.findings.some((f) => f.rule === "ingestion-dominates" && f.row === "/aws/ecs/web-access"));
  assert.ok(r.findings.some((f) => f.rule === "ia-class-candidate" && f.row === "/aws/ecs/web-access"));
  assert.ok(!r.findings.some((f) => f.rule === "ia-class-candidate" && f.row === "/aws/rds/audit"));
});

test("never-expire without age is warned but no saving is invented", () => {
  const r = analyze(parseGroups("/x,500,never,10"));
  assert.ok(r.findings.some((f) => f.rule === "retention-never-expires"));
  assert.equal(r.totals.saving, 0);
});

test("summary and empty input", () => {
  assert.equal(summarize(analyze(parseGroups(text))).status, "warn");
  assert.equal(summarize(analyze(parseGroups("nothing"))).status, "none");
  assert.equal(summarize(analyze(parseGroups("/x,1,7,1"))).status, "ok");
});
