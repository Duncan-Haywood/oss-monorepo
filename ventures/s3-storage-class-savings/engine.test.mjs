import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseInventory, analyze, summarize, lifecycleConfig, money, GIB, SIZE_FILTER_GREATER_THAN } from "./engine.mjs";

const AS_OF = Date.parse("2026-10-01T00:00:00Z");
// 2026-01-01 is 273 days before AS_OF: the 180-365 day bucket, eligible for every action.
const row = (size, cls = "STANDARD", date = "2026-01-01T00:00:00Z") => `b,"k",${size},${date},${cls}`;
const csv = (...rows) => `Bucket,Key,Size,LastModifiedDate,StorageClass\n${rows.join("\n")}`;
const many = (n, size, cls, date) => Array.from({ length: n }, () => row(size, cls, date)).join("\n");
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ""} ${a} != ${b}`);
const run = (text, opts = {}) => analyze(parseInventory(text), { asOf: AS_OF, ...opts });
const cand = (r, id) => r.candidates.find((c) => c.id === id);

test("parseCsv handles quotes, doubled quotes, embedded commas and CRLF", () => {
  assert.deepEqual(parseCsv('a,"b,c","d""e"\r\n1,2,3\n'), [["a", "b,c", 'd"e'], ["1", "2", "3"]]);
});

test("parseInventory: header in any order, no header, non-current and delete markers left out", () => {
  const p = parseInventory('Size,StorageClass,Key,Bucket,LastModifiedDate,IsLatest,IsDeleteMarker\n100,STANDARD,"a,b",bk,2026-01-01T00:00:00Z,true,false\n5,STANDARD,k,bk,2026-01-01T00:00:00Z,false,false\n0,STANDARD,k,bk,2026-01-01T00:00:00Z,true,true\nx,STANDARD,k,bk,2026-01-01T00:00:00Z,true,false');
  assert.equal(p.rows.length, 1);
  assert.equal(p.rows[0].size, 100);
  assert.deepEqual([p.ignoredNonCurrent, p.ignoredDeleteMarkers, p.skipped], [1, 1, 1]);
  const bare = parseInventory('bk,key,2048,2026-01-01T00:00:00Z,STANDARD_IA');
  assert.equal(bare.headerFound, false);
  assert.equal(bare.rows[0].storageClass, "STANDARD_IA");
  assert.equal(parseInventory(csv("b,k,10,not-a-date,")).undated, 1);
});

test("current cost by class: Standard, IA minimum size, Glacier overhead, Intelligent-Tiering tiers", () => {
  const r = run(csv(many(10, GIB), many(1000, 1024, "STANDARD_IA"), row(GIB, "GLACIER"), row(1000, "INTELLIGENT_TIERING"), row(GIB, "INTELLIGENT_TIERING")));
  const c = (k) => r.byClass.find((x) => x.cls === k).monthlyCost;
  near(c("STANDARD"), 10 * 0.023);
  // 1,000 objects of 1 KiB are billed as 128 KiB each: 1000 * 131072 B = 0.1220703125 GiB at 0.0125.
  near(c("STANDARD_IA"), 0.1220703125 * 0.0125);
  // (1 GiB + 32 KiB) at 0.0036 plus 8 KiB at the Standard rate.
  near(c("GLACIER"), (1 + 32768 / GIB) * 0.0036 + (8192 / GIB) * 0.023);
  // 1 GiB monitored object (no tier column: frequent) + 1000 B unmonitored object at the frequent rate.
  near(c("INTELLIGENT_TIERING"), 0.023 + 0.0025 / 1000 + (1000 / GIB) * 0.023);
});

test("age buckets split Standard objects by LastModified", () => {
  const d = (days) => new Date(AS_OF - days * 86400000).toISOString();
  const r = run(csv(row(1, "STANDARD", d(0)), row(1, "STANDARD", d(29)), row(1, "STANDARD", d(30)), row(1, "STANDARD", d(179)), row(1, "STANDARD", d(180)), row(1, "STANDARD", d(364)), row(1, "STANDARD", d(365)), row(1, "STANDARD_IA", d(400))));
  assert.deepEqual(r.ageBuckets.map((b) => b.standardCount), [2, 1, 1, 2, 1]);
});

test("Standard-IA: 10 x 1 GiB, hand-computed", () => {
  const ia = cand(run(csv(many(10, GIB))), "STANDARD_IA");
  // base 12 * 10 * 0.023 = 2.76; after 12 * 10 * 0.0125 = 1.5; fee 10 * 0.01 / 1000 = 0.0001; retrieval 12 * 1% * 10 * 0.01 = 0.012.
  near(ia.filtered.base12, 2.76); near(ia.filtered.after12, 1.5); near(ia.filtered.trans, 0.0001); near(ia.filtered.retrieval12, 0.012);
  near(ia.filtered.net, 2.76 - 1.5 - 0.0001 - 0.012);
  near(ia.unfiltered.net, ia.filtered.net);
});

test("small objects lose money: 1,000,000 x 10 KiB into Standard-IA", () => {
  const r = run(csv(many(1000000, 10240)));
  const ia = cand(r, "STANDARD_IA");
  const GB = 1e6 * 10240 / GIB; // 9.5367431640625
  // each billed as 128 KiB: 1e6 * 131072 / 2^30 = 122.0703125 GiB; fee 1e6 * 0.01 / 1000 = 10; retrieval 12 * 0.01 * GB * 0.01.
  const expected = 12 * GB * 0.023 - 12 * 122.0703125 * 0.0125 - 10 - 12 * 0.01 * GB * 0.01;
  near(ia.unfiltered.net, expected);
  assert.ok(Math.abs(expected + 25.689849853515625) < 1e-9);
  assert.equal(ia.filtered.count, 0);
  assert.equal(r.smallObjects.count, 1000000);
  assert.ok(r.findings.some((f) => f.rule === "small-objects-lose-money"));
  assert.equal(r.best, null, "no action nets a saving on 10 KiB objects");
  assert.equal(r.lifecycle, null);
});

test("Deep Archive: 100 x 1 GiB includes 40 KB overhead, fee and retrieval", () => {
  const da = cand(run(csv(many(100, GIB))), "DEEP_ARCHIVE").filtered;
  const monthly = (100 + (100 * 32768) / GIB) * 0.00099 + ((100 * 8192) / GIB) * 0.023;
  near(da.net, 12 * 100 * 0.023 - 12 * monthly - 100 * 0.05 / 1000 - 12 * 0.01 * 100 * 0.02);
  assert.ok(Math.abs(da.net - 26.16675317) < 1e-6);
  near(da.minDurationExposure, 6 * monthly);
});

test("Intelligent-Tiering: 10 x 1 GiB over 12 months, hand-computed", () => {
  const it = cand(run(csv(many(10, GIB))), "INTELLIGENT_TIERING").filtered;
  // month 1 frequent 0.23; months 2-3 at (0.99*0.0125+0.01*0.023)*10 = 0.12605; months 4-12 at (0.99*0.004+0.01*0.023)*10 = 0.0419
  const after = 0.23 + 2 * 0.12605 + 9 * 0.0419 + 12 * (10 / 1000) * 0.0025;
  near(it.after12, after);
  near(it.net, 2.76 - after - 0.0001);
  assert.ok(Math.abs(it.net - 1.9004) < 1e-9);
});

test("Intelligent-Tiering never helps objects under 128 KiB: only the request fee is lost", () => {
  const it = cand(run(csv(many(1000, 100000))), "INTELLIGENT_TIERING");
  near(it.unfiltered.net, -(1000 * 0.01) / 1000);
  assert.equal(it.filtered.count, 0);
});

test("early deletion pays the request fee and the minimum duration instead of saving", () => {
  const ia = cand(run(csv(many(10, GIB)), { earlyDeletePct: 50 }), "STANDARD_IA").filtered;
  const net12 = 2.76 - 1.5 - 0.0001 - 0.012;
  near(ia.net, 0.5 * net12 - 0.5 * (0.0001 + 0.125));
  assert.ok(Math.abs(ia.net - 0.5614) < 1e-9);
});

test("retrieval share and region multiplier move the answer", () => {
  const text = csv(many(10, GIB));
  const heavy = cand(run(text, { retrievalPct: 100 }), "STANDARD_IA").filtered.net;
  // retrieving every byte every month: 12 * 100% * 10 GiB * 0.01 = 1.2
  near(heavy, 2.76 - 1.5 - 0.0001 - 1.2);
  assert.ok(heavy < cand(run(text), "STANDARD_IA").filtered.net);
  // every price scaled by 2: base and savings double.
  near(cand(run(text, { regionMultiplier: 2 }), "STANDARD_IA").filtered.net, 2 * (2.76 - 1.5 - 0.0001 - 0.012));
});

test("a size filter turns the best action from a loss into a saving and the lifecycle JSON carries it", () => {
  const r = run(csv(many(10, GIB), many(1000000, 10240)));
  const ia = cand(r, "STANDARD_IA");
  near(ia.filtered.net, 1.2479);
  near(ia.unfiltered.net, 1.2479 - 25.689849853515625);
  assert.equal(r.best.id, "DEEP_ARCHIVE");
  assert.equal(r.best.filtered, true);
  assert.deepEqual(r.lifecycle.Rules[0].Filter, { ObjectSizeGreaterThan: SIZE_FILTER_GREATER_THAN });
  assert.equal(SIZE_FILTER_GREATER_THAN, 131071);
  assert.deepEqual(r.lifecycle.Rules[0].Transitions, [{ Days: 180, StorageClass: "DEEP_ARCHIVE" }]);
  assert.equal(r.lifecycle.Rules[0].Status, "Enabled");
});

test("only objects past each action's age are eligible; non-Standard classes are not candidates", () => {
  const young = new Date(AS_OF - 100 * 86400000).toISOString(); // 90-180 bucket: IA, GIR, GLACIER eligible; DEEP_ARCHIVE not
  const r = run(csv(many(10, GIB, "STANDARD", young), many(5, GIB, "STANDARD_IA", young)));
  assert.equal(cand(r, "STANDARD_IA").filtered.count, 10);
  assert.equal(cand(r, "DEEP_ARCHIVE").filtered.count, 0);
  assert.equal(r.standard.count, 10);
});

test("avoidable-waste warns above the threshold and not below", () => {
  const text = csv(many(3, 4000 * GIB));
  const warn = run(text, { wasteThresholdPerMonth: 100 });
  assert.equal(warn.findings.find((f) => f.rule === "avoidable-waste").severity, "warn");
  assert.equal(summarize(warn).status, "warn");
  const quiet = run(text, { wasteThresholdPerMonth: 1e9 });
  assert.ok(!quiet.findings.some((f) => f.rule === "avoidable-waste"));
  assert.equal(summarize(quiet).status, "ok");
});

test("empty input and helpers", () => {
  assert.equal(run("").count, 0);
  assert.equal(summarize(run("nonsense")).status, "none");
  assert.equal(money(-1234.5), "-$1,234.50");
  assert.equal(lifecycleConfig({ id: "STANDARD_IA", minAgeDays: 30 }, false).Rules[0].Filter.Prefix, "");
});
