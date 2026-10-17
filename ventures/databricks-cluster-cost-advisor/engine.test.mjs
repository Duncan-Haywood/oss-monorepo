import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseClusters, analyze, summarize, normalizeKind } from "./engine.mjs";

const text = readFileSync(new URL("./fixtures/clusters.csv", import.meta.url), "utf8");
const by = (r) => Object.fromEntries(r.clusters.map((c) => [c.name, c]));

test("kinds normalise; unknown kinds are skipped", () => {
  assert.equal(normalizeKind("All-Purpose"), "interactive");
  assert.equal(normalizeKind("Jobs Compute"), "jobs");
  assert.equal(normalizeKind("scheduled"), "scheduled");
  assert.equal(normalizeKind("sql"), null);
});

test("parser maps headers, reads never/blank/0 as 0, skips bad rows", () => {
  const p = parseClusters("# c\nkind,cluster,dbu_month,autotermination_minutes\ninteractive,A,10,never\njobs,B,5,\nscheduled,C,5,120\nsql,D,1,60\njobs,E,x,60\n");
  assert.equal(p.rows.length, 3);
  assert.deepEqual(p.rows.map((r) => r.term), [0, 0, 120]);
  assert.equal(p.skipped, 2);
});

test("scheduled work on all-purpose saves the DBU rate difference and is not double-flagged", () => {
  const r = analyze(parseClusters(text));
  assert.ok(Math.abs(by(r)["nightly-etl"].saving - 9000 * (0.55 - 0.15)) < 1e-6);
  assert.ok(r.findings.some((f) => f.rule === "scheduled-on-all-purpose" && f.row === "nightly-etl"));
  assert.ok(!r.findings.some((f) => f.rule === "no-autotermination" && f.row === "nightly-etl"));
  assert.equal(by(r)["reporting-jobs"].saving, 0);
});

test("long autotermination: starts x excess minutes x DBU/hour x price, capped at 80% of DBUs", () => {
  const r = analyze(parseClusters(text));
  const expect = Math.min((300 * 90) / 60 * 12, 2400 * 0.8) * 0.55;
  assert.ok(Math.abs(by(r)["analyst-shared"].saving - expect) < 1e-6);
  const capped = analyze(parseClusters("W,interactive,100,600,10,500"));
  assert.ok(Math.abs(capped.totals.saving - 100 * 0.8 * 0.55) < 1e-9);
});

test("always-on interactive cluster is flagged with a bounded work-hours model", () => {
  const r = analyze(parseClusters(text));
  const f = r.findings.find((x) => x.rule === "always-on-cluster");
  assert.equal(f.row, "ml-sandbox");
  assert.match(f.message, /autotermination_minutes": 30/);
  assert.ok(Math.abs(by(r)["ml-sandbox"].saving - (8760 - 12 * 220) * 0.55) < 1e-6);
  const plain = analyze(parseClusters("X,interactive,500,never"));
  assert.ok(plain.findings.some((x) => x.rule === "no-autotermination"));
});

test("totals add the savings once per cluster; dominance note; healthy list is fine", () => {
  const r = analyze(parseClusters(text));
  assert.ok(Math.abs(r.totals.saving - (3600 + by(r)["analyst-shared"].saving + by(r)["ml-sandbox"].saving)) < 1e-6);
  assert.ok(analyze(parseClusters("A,jobs,900,0\nB,jobs,100,0")).findings.some((f) => f.rule === "one-cluster-dominates" && f.row === "A"));
  const ok = analyze(parseClusters("J,jobs,300,0,10,20"));
  assert.equal(ok.findings[0].rule, "clusters-fine");
  assert.equal(summarize(ok).status, "ok");
  assert.equal(summarize(r).status, "warn");
  assert.equal(summarize(analyze(parseClusters("nothing"))).status, "none");
});
