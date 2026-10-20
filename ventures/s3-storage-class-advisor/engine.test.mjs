import test from "node:test";
import assert from "node:assert/strict";
import { parseRows, analyze, summarize, priceRow, DEFAULT_PRICES } from "./engine.mjs";

const row = (o) => ({ name: "x", sizeGb: 1000, objects: 1000000, readGb: 0, gets: 0, lifeDays: null, ...o });

test("parseRows reads rows, skips header and junk, caps read at size", () => {
  const { records, skipped } = parseRows("name,size_gb,objects,read_gb,gets\n# c\na,100,1000,5,10\nb,50,10,999,0,7\nbad line\n");
  assert.equal(records.length, 2);
  assert.equal(records[1].readGb, 50);
  assert.equal(records[1].lifeDays, 7);
  assert.equal(skipped, 1);
});

test("Standard is exact arithmetic", () => {
  const { cost } = priceRow(row({ gets: 1000000 }), "standard");
  assert.ok(Math.abs(cost - (1000 * 0.023 + 1000 * 0.0004)) < 1e-9);
});

test("cold large objects: Glacier IR beats Standard; retrieval-heavy flips it", () => {
  const cold = row({ objects: 100000, readGb: 10 });
  assert.ok(priceRow(cold, "glacier-ir").cost < priceRow(cold, "standard").cost);
  const hot = row({ objects: 100000, readGb: 900, gets: 5e6 });
  assert.ok(priceRow(hot, "glacier-ir").cost > priceRow(hot, "standard").cost);
});

test("small objects are billed at 128 KB in IA / Glacier IR and are not tiered by Intelligent-Tiering", () => {
  const small = row({ sizeGb: 100, objects: 10_000_000 }); // ~10 KB each
  const ia = priceRow(small, "standard-ia");
  assert.ok(ia.notes[0].includes("128 KB"));
  assert.ok(ia.cost > priceRow(small, "standard").cost);
  assert.equal(priceRow(small, "intelligent-tiering").cost, priceRow(small, "standard").cost);
});

test("minimum duration multiplies IA storage cost", () => {
  const short = row({ lifeDays: 6, objects: 1000 });
  const long = row({ lifeDays: null, objects: 1000 });
  assert.ok(priceRow(short, "standard-ia").cost > priceRow(long, "standard-ia").cost);
});

test("analyze: warns on a cold row, stays quiet on a hot one, totals add up", () => {
  const r = analyze({ records: [row({ name: "cold", objects: 100000, readGb: 5 }), row({ name: "hot", sizeGb: 100, objects: 100000, readGb: 100, gets: 1e6 })] });
  assert.ok(r.findings.some((f) => f.rule.startsWith("move-to-") && f.row === "cold"));
  assert.ok(r.findings.some((f) => f.rule === "class-fine" && f.row === "hot"));
  assert.ok(Math.abs(r.totals.saving - (r.totals.current - r.totals.best)) < 1e-9);
  assert.equal(summarize(r).status, "warn");
});

test("empty input yields status none", () => {
  assert.equal(summarize(analyze(parseRows(""))).status, "none");
});

test("price overrides apply", () => {
  const free = { ...DEFAULT_PRICES, standard: { gbMonth: 0, per1kGet: 0, retrievalPerGb: 0 } };
  assert.equal(priceRow(row(), "standard", free).cost, 0);
});

test("parseRows skips a row whose life column is present but not a number", () => {
  const { records, skipped } = parseRows("a,100,1000,5,10,abc\nb,100,1000,5,10,");
  assert.deepEqual(records.map((r) => r.name), ["b"]);
  assert.equal(records[0].lifeDays, null);
  assert.equal(skipped, 1);
});

test("minimum duration only applies to objects that live shorter than it", () => {
  const base = priceRow(row({ lifeDays: null, objects: 1000 }), "standard-ia").cost;
  assert.equal(priceRow(row({ lifeDays: 60, objects: 1000 }), "standard-ia").cost, base); // lives past 30 days
  assert.equal(priceRow(row({ lifeDays: 30, objects: 1000 }), "standard-ia").cost, base); // exactly the minimum
  const zero = priceRow(row({ lifeDays: 0, objects: 1000 }), "standard-ia");
  assert.equal(zero.cost, base);
  assert.deepEqual(zero.notes, []);
  const short = priceRow(row({ lifeDays: 15, objects: 1000 }), "standard-ia");
  assert.ok(Math.abs(short.cost - (1000 * 0.0125 * 2 + 0)) < 1e-9);
  assert.match(short.notes[0], /x2\.0/);
});

test("Intelligent-Tiering is exact arithmetic over hot, infrequent and archive-instant shares", () => {
  // 1000 GB, 100 read -> 900 cold; 30% of cold infrequent, 70% archive instant.
  const r = row({ sizeGb: 1000, objects: 2_000_000, readGb: 100, gets: 1_000_000 });
  const expected = 100 * 0.023 + 900 * 0.3 * 0.0125 + 900 * 0.7 * 0.004 + 2000 * 0.0025 + 1000 * 0.0004;
  assert.ok(Math.abs(priceRow(r, "intelligent-tiering").cost - expected) < 1e-9);
});

test("analyze totals sum the per-row current and best costs", () => {
  const rows = [row({ name: "a", objects: 100000, readGb: 5 }), row({ name: "b", sizeGb: 500, objects: 50000, readGb: 1 })];
  const rep = analyze({ records: rows });
  const cur = rep.rows.reduce((s, x) => s + x.current, 0);
  const best = rep.rows.reduce((s, x) => s + x.costs[x.best], 0);
  assert.ok(Math.abs(rep.totals.current - cur) < 1e-9);
  assert.ok(Math.abs(rep.totals.best - best) < 1e-9);
  assert.ok(rep.totals.current > 0 && rep.totals.best > 0 && rep.totals.saving > 0);
});
