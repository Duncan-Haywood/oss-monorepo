import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parsePlan, analyze, summarize, filterColumns, renderTree } from "./engine.mjs";

const SAMPLE = readFileSync(new URL("./sample.txt", import.meta.url), "utf8");
const rules = (r) => r.findings.map((f) => f.rule);

test("text plan parses into a tree with relations, loops and footer times", () => {
  const p = parsePlan(SAMPLE);
  assert.equal(p.format, "text");
  assert.equal(p.nodes.length, 5);
  assert.equal(p.executionMs, 913.208);
  assert.equal(p.planningMs, 0.412);
  const orders = p.nodes.find((n) => n.relation === "orders");
  assert.equal(orders.loops, 4800);
  assert.equal(orders.removedByFilter, 99989);
  assert.equal(orders.filter, "(customer_id = c.id)");
  assert.equal(p.nodes[0].children.length, 1);
});

test("self time subtracts children and multiplies by loops", () => {
  const p = parsePlan(SAMPLE); analyze(p);
  const orders = p.nodes.find((n) => n.relation === "orders");
  assert.ok(Math.abs(orders.exclusiveMs - 0.15 * 4800) < 1e-6);
});

test("the sample trips the headline rules", () => {
  const r = analyze(parsePlan(SAMPLE));
  for (const rule of ["sort-spills-to-disk", "nested-loop-seq-scan", "row-misestimate", "seq-scan-discards-rows", "dominant-node"]) assert.ok(rules(r).includes(rule), rule);
  const nl = r.findings.find((f) => f.rule === "nested-loop-seq-scan");
  assert.match(nl.fix, /CREATE INDEX CONCURRENTLY ON orders \(customer_id\)/);
  assert.equal(r.topNodes[0].label, "#5 Seq Scan on orders");
  assert.equal(summarize(r).status, "error");
});

test("a seq scan flagged as nested-loop inner is not also flagged as a discarding scan", () => {
  const r = analyze(parsePlan(SAMPLE));
  assert.ok(!r.findings.some((f) => f.rule === "seq-scan-discards-rows" && f.nodeLabel.includes("orders")));
});

test("JSON plan parses to the same findings as the text plan", () => {
  const json = JSON.stringify([{ Plan: {
    "Node Type": "Nested Loop", "Plan Rows": 120, "Actual Rows": 52800, "Actual Loops": 1, "Actual Total Time": 800, "Actual Startup Time": 0.06,
    Plans: [
      { "Node Type": "Seq Scan", "Relation Name": "customers", "Plan Rows": 50, "Actual Rows": 4800, "Actual Loops": 1, "Actual Total Time": 18, "Filter": "(region = 'EU'::text)", "Rows Removed by Filter": 95200 },
      { "Node Type": "Seq Scan", "Relation Name": "orders", "Plan Rows": 2, "Actual Rows": 11, "Actual Loops": 4800, "Actual Total Time": 0.15, "Filter": "(customer_id = c.id)", "Rows Removed by Filter": 99989 },
    ] }, "Planning Time": 0.4, "Execution Time": 800.5 }]);
  const p = parsePlan(json);
  assert.equal(p.format, "json");
  const r = analyze(p);
  assert.ok(rules(r).includes("nested-loop-seq-scan"));
  assert.equal(p.executionMs, 800.5);
});

test("a plan without ANALYZE gets a no-analyze note and no misestimate findings", () => {
  const p = parsePlan("Seq Scan on t  (cost=0.00..10.00 rows=5 width=4)\n  Filter: (a = 1)");
  assert.equal(p.hasActual, false);
  assert.deepEqual(rules(analyze(p)), ["no-analyze"]);
});

test("a fast, healthy index scan raises nothing", () => {
  const r = analyze(parsePlan("Index Scan using users_pkey on users  (cost=0.29..8.30 rows=1 width=40) (actual time=0.020..0.022 rows=1 loops=1)\n  Index Cond: (id = 42)\nPlanning Time: 0.1 ms\nExecution Time: 0.05 ms"));
  assert.deepEqual(r.findings, []);
  assert.equal(summarize(r).status, "ok");
});

test("hash batches > 1 and parallel shortfall and heap fetches are reported", () => {
  const txt = [
    "Gather  (cost=1.00..2.00 rows=10 width=4) (actual time=1.0..50.0 rows=10 loops=1)",
    "  Workers Planned: 4",
    "  Workers Launched: 1",
    "  ->  Hash Join  (cost=1.00..2.00 rows=10 width=4) (actual time=1.0..49.0 rows=10 loops=2)",
    "        Hash Cond: (a.id = b.id)",
    "        ->  Index Only Scan using a_idx on a  (cost=0.1..1.0 rows=10 width=4) (actual time=0.1..5.0 rows=10 loops=2)",
    "              Heap Fetches: 9000",
    "        ->  Hash  (cost=1.0..1.0 rows=10 width=4) (actual time=0.5..0.5 rows=10 loops=2)",
    "              Buckets: 1024  Batches: 8  Memory Usage: 33kB",
    "Execution Time: 50.5 ms",
  ].join("\n");
  const r = analyze(parsePlan(txt));
  for (const rule of ["hash-spills-to-disk", "parallel-workers-short", "heap-fetches"]) assert.ok(rules(r).includes(rule), rule);
});

test("buffers lines and the Planning: footer do not leak onto nodes", () => {
  const txt = [
    "Seq Scan on t  (cost=0.00..10.00 rows=100 width=4) (actual time=0.1..20.0 rows=100 loops=1)",
    "  Buffers: shared hit=3 read=12000, temp read=1 written=2",
    "Planning:",
    "  Buffers: shared hit=999",
    "Planning Time: 1.0 ms",
    "Execution Time: 21.0 ms",
  ].join("\n");
  const p = parsePlan(txt);
  assert.equal(p.nodes[0].sharedRead, 12000);
  assert.equal(p.nodes[0].sharedHit, 3);
  const r = analyze(p);
  assert.ok(rules(r).includes("cold-reads"));
  assert.ok(rules(r).includes("temp-file-writes"));
});

test("bad input returns an error rather than throwing", () => {
  assert.ok(parsePlan("").error);
  assert.ok(parsePlan("hello world").error);
  assert.ok(parsePlan("[{\"x\":1}]").error);
  assert.ok(parsePlan("[{broken").error);
});

test("filterColumns puts equality columns before range columns and ignores casts and keywords", () => {
  assert.deepEqual(filterColumns("((created_at > now()) AND (status = 'x'::text) AND (o.user_id = 5))"), { eq: ["status", "user_id"], range: ["created_at"] });
  assert.deepEqual(filterColumns(null), { eq: [], range: [] });
});

test("renderTree shows self time and estimate vs actual", () => {
  const p = parsePlan(SAMPLE); analyze(p);
  assert.match(renderTree(p), /Seq Scan on orders {2}rows 11 \(est 2\) x4,800 {2}720\.0 ms self/);
});
