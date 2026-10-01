import test from "node:test";
import assert from "node:assert/strict";
import { parseSampleLine, parseExposition, analyze, estimateCost, topSavings, summarize, DEFAULT_PRICES } from "./engine.mjs";

const mk = (n, f) => Array.from({ length: n }, (_, i) => f(i)).join("\n");

test("parses plain, labelled, timestamped and exemplar lines", () => {
  assert.deepEqual(parseSampleLine("up 1"), { name: "up", labels: [] });
  assert.deepEqual(parseSampleLine('http_requests_total{method="GET",code="200"} 12 1700000000'), { name: "http_requests_total", labels: [["method", "GET"], ["code", "200"]] });
  assert.equal(parseSampleLine('x_bucket{le="0.5"} 3 # {trace_id="abc"} 1 1700').labels.length, 1);
  assert.equal(parseSampleLine("# HELP up whatever"), null);
  assert.equal(parseSampleLine("nonsense without value"), null);
});

test("quoted label values may contain commas, braces and escaped quotes", () => {
  const p = parseSampleLine('m{path="/a,b}\\"c",x="1"} 4');
  assert.deepEqual(p.labels, [["path", '/a,b}"c'], ["x", "1"]]);
});

test("duplicate series count once; label order does not matter", () => {
  const r = analyze(parseExposition('m{a="1",b="2"} 1\nm{b="2",a="1"} 2\nm{a="1",b="3"} 1'));
  assert.equal(r.totalSeries, 2);
});

test("histogram _bucket/_sum/_count group under one family via TYPE", () => {
  const text = `# TYPE lat histogram
lat_bucket{le="0.1"} 1
lat_bucket{le="+Inf"} 2
lat_sum 3
lat_count 2`;
  const r = analyze(parseExposition(text));
  assert.equal(r.families.length, 1);
  assert.equal(r.families[0].name, "lat");
  assert.equal(r.families[0].series, 4);
});

test("a high-cardinality label is flagged and the exact saving from dropping it is computed", () => {
  const text = mk(120, (i) => `http_requests_total{path="/u/${i}",method="GET"} 1`) + '\nhttp_requests_total{path="/x",method="POST"} 1';
  const r = analyze(parseExposition(text));
  const f = r.families[0];
  assert.equal(f.series, 121);
  const path = f.labels.find((l) => l.name === "path");
  assert.equal(path.distinct, 121);
  assert.deepEqual(path.drop, { remaining: 2, saved: 119 }); // (GET), (POST)
  assert.ok(r.findings.some((x) => x.rule === "high-cardinality-label" && x.label === "path"));
  assert.deepEqual(topSavings(r, 1)[0], { metric: "http_requests_total", label: "path", saved: 119, of: 121 });
});

test("unbounded label names are flagged even below the threshold", () => {
  const r = analyze(parseExposition('m{user_id="1"} 1\nm{user_id="2"} 1\nm{user_id="3"} 1'));
  assert.ok(r.findings.some((x) => x.rule === "unbounded-label" && x.label === "user_id"));
});

test("a single-valued user label is not flagged", () => {
  const r = analyze(parseExposition('m{user="svc"} 1'));
  assert.equal(r.findings.length, 0);
});

test("le and quantile are never offered as droppable", () => {
  const r = analyze(parseExposition('# TYPE s summary\ns{quantile="0.5",job="a"} 1\ns{quantile="0.9",job="a"} 1'));
  const q = r.families[0].labels.find((l) => l.name === "quantile");
  assert.equal(q.drop, null);
});

test("histogram bucket multiplier note needs many buckets and many series", () => {
  const rows = [];
  for (let h = 0; h < 60; h += 1) for (let b = 0; b < 12; b += 1) rows.push(`lat_bucket{host="h${h}",le="${b}"} 1`);
  const r = analyze(parseExposition(`# TYPE lat histogram\n${rows.join("\n")}`));
  assert.ok(r.findings.some((x) => x.rule === "histogram-bucket-multiplier"));
});

test("cost: series x targets, free allowance deducted, prices overridable", () => {
  const [g, d] = estimateCost(5000, { targets: 10 }, DEFAULT_PRICES);
  assert.equal(g.activeSeries, 50000);
  assert.equal(g.billable, 40000);
  assert.equal(g.monthly, 320); // 40 x $8
  assert.equal(d.monthly, 2500); // 50 x $50
  assert.equal(estimateCost(100, { targets: 1 }, { x: { perThousand: 1, free: 1000 } })[0].monthly, 0);
});

test("summary: budget gate is an error, warnings alone are not", () => {
  const r = analyze(parseExposition(mk(60, (i) => `m{id="${i}"} 1`)));
  assert.equal(summarize(r).status, "warn");
  const s = summarize(r, { maxSeries: 100, targets: 2 });
  assert.equal(s.status, "error");
  assert.equal(s.overBudget, true);
  assert.equal(summarize(analyze(parseExposition(""))).status, "none");
});
