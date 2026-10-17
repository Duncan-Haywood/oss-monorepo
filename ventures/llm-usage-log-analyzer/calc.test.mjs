import { test } from "node:test";
import assert from "node:assert/strict";
import { parseUsageLog, findRate, recordCost, analyze, modelSwitchSavings, reportText } from "./calc.mjs";

const RATES = {
  "model-a": { input: 3, cachedInput: 0.3, cacheWrite: 3.75, output: 15 },
  "model-b": { input: 1, cachedInput: 0.5, output: 4 },
};

test("Anthropic usage keeps cache buckets separate from input_tokens", () => {
  const line = JSON.stringify({
    model: "model-a",
    usage: { input_tokens: 100, cache_read_input_tokens: 900, cache_creation_input_tokens: 50, output_tokens: 20 },
  });
  const { records } = parseUsageLog(line);
  assert.deepEqual(
    [records[0].fresh, records[0].cacheRead, records[0].cacheWrite, records[0].output],
    [100, 900, 50, 20],
  );
});

test("OpenAI prompt_tokens include cached_tokens, so fresh is the difference", () => {
  const { records } = parseUsageLog(
    JSON.stringify([{ model: "model-b", usage: { prompt_tokens: 1000, completion_tokens: 10, prompt_tokens_details: { cached_tokens: 800 } } }]),
  );
  assert.equal(records[0].fresh, 200);
  assert.equal(records[0].cacheRead, 800);
});

test("cached_tokens above prompt_tokens is clamped, never negative fresh", () => {
  const { records } = parseUsageLog(JSON.stringify([{ model: "m", usage: { prompt_tokens: 10, cached_tokens: 99 } }]));
  assert.equal(records[0].fresh, 0);
  assert.equal(records[0].cacheRead, 10);
});

test("JSONL, wrapped data arrays and CSV all parse; junk lines are counted, not fatal", () => {
  const jsonl = '{"model":"a","input_tokens":5,"output_tokens":1}\nnot json\n{"model":"a","input_tokens":7}';
  const r1 = parseUsageLog(jsonl);
  assert.equal(r1.records.length, 2);
  assert.equal(r1.skipped, 1);
  const r2 = parseUsageLog(JSON.stringify({ data: [{ model: "a", input_tokens: 5 }] }));
  assert.equal(r2.records.length, 1);
  const csv = 'model,input_tokens,output_tokens,label,created_at\n"a",100,10,"chat, v2",2026-09-01T10:00:00Z\nb,50,5,,';
  const r3 = parseUsageLog(csv);
  assert.equal(r3.records.length, 2);
  assert.equal(r3.records[0].label, "chat, v2");
  assert.equal(r3.records[0].day, "2026-09-01");
});

test("rows with no model or no tokens are skipped", () => {
  const { records, skipped } = parseUsageLog('[{"input_tokens":5},{"model":"a"},{"model":"a","input_tokens":1}]');
  assert.equal(records.length, 1);
  assert.equal(skipped, 2);
});

test("timestamps accept seconds, milliseconds and ISO", () => {
  const sec = parseUsageLog('[{"model":"a","input_tokens":1,"created":1788000000}]').records[0];
  const ms = parseUsageLog('[{"model":"a","input_tokens":1,"created":1788000000000}]').records[0];
  assert.equal(sec.day, ms.day);
});

test("findRate prefers the longest matching prefix, case-insensitively", () => {
  const rates = { "model": { input: 1 }, "model-a": { input: 2 } };
  assert.equal(findRate("Model-A-20260101", rates).input, 2);
  assert.equal(findRate("model-z", rates).input, 1);
  assert.equal(findRate("other", rates), null);
});

test("recordCost prices each bucket at its own rate; missing cached/write rates default to input", () => {
  const cost = recordCost({ fresh: 1e6, cacheRead: 1e6, cacheWrite: 1e6, output: 1e6 }, RATES["model-a"]);
  assert.equal(cost, 3 + 0.3 + 3.75 + 15);
  const dflt = recordCost({ fresh: 1e6, cacheRead: 1e6, cacheWrite: 1e6, output: 0 }, { input: 2, output: 0 });
  assert.equal(dflt, 6);
});

function rec(over) {
  return { model: "model-a", fresh: 0, cacheRead: 0, cacheWrite: 0, output: 0, ts: null, day: null, label: "", ...over };
}

test("analyze totals, groups by model and label, and flags unpriced models", () => {
  const records = [
    rec({ fresh: 1e6, output: 1e5, label: "chat", day: "2026-09-01" }),
    rec({ model: "mystery", fresh: 1e6, label: "chat", day: "2026-09-02" }),
    rec({ model: "model-b", fresh: 2e6, label: "batch", day: "2026-09-02" }),
  ];
  const a = analyze(records, RATES);
  assert.equal(a.totalCost, 3 + 1.5 + 2);
  assert.equal(a.unpricedRequests, 1);
  assert.deepEqual(a.unpricedModels, ["mystery"]);
  assert.equal(a.byModel[0].key, "model-a");
  assert.equal(a.byLabel.find((g) => g.key === "chat").requests, 2);
  assert.equal(a.forecast.spanDays, 2);
  assert.equal(a.forecast.projected30Days, round2(a.totalCost / 2 * 30));
});
const round2 = (n) => Math.round(n * 1e6) / 1e6;

test("low cache-hit finding reports an upper-bound saving; a healthy rate reports none", () => {
  const cold = analyze([rec({ fresh: 9e6, cacheRead: 1e6 })], RATES, { cacheTarget: 0.7 });
  const f = cold.findings.find((x) => x.id === "cache-hit-rate");
  // moves 0.7*10M - 1M = 6M tokens from $3 to $0.30 => $16.20
  assert.equal(f.savings, 16.2);
  const warm = analyze([rec({ fresh: 1e6, cacheRead: 9e6 })], RATES, { cacheTarget: 0.7 });
  assert.equal(warm.findings.filter((x) => x.id === "cache-hit-rate").length, 0);
});

test("no cache finding when the cached rate is not below the fresh rate", () => {
  const a = analyze([rec({ fresh: 9e6, cacheRead: 1e6 })], { "model-a": { input: 3, cachedInput: 3, output: 1 } });
  assert.equal(a.findings.filter((x) => x.id === "cache-hit-rate").length, 0);
});

test("batch what-if scales with the share and discount the caller entered", () => {
  const a = analyze([rec({ fresh: 1e6 })], RATES, { batchShare: 0.5, batchDiscount: 0.5 });
  assert.equal(a.findings.find((x) => x.id === "batch-discount").savings, 0.75);
  assert.equal(analyze([rec({ fresh: 1e6 })], RATES).findings.some((x) => x.id === "batch-discount"), false);
});

test("context outliers are flagged only when they carry a real share of spend", () => {
  const many = Array.from({ length: 20 }, () => rec({ fresh: 1000 }));
  const a = analyze([...many, rec({ fresh: 5e6 })], RATES);
  assert.ok(a.findings.some((x) => x.id === "context-outliers"));
  const b = analyze([...many, rec({ fresh: 4000 })], RATES, { outlierFactor: 5 });
  assert.equal(b.findings.some((x) => x.id === "context-outliers"), false);
});

test("concentration reports the share of spend in the top requests", () => {
  const rs = [...Array.from({ length: 99 }, () => rec({ fresh: 1000 })), rec({ fresh: 1e6 })];
  const a = analyze(rs, RATES);
  assert.ok(a.concentration.top1pct > 0.9);
});

test("modelSwitchSavings prices identical tokens at the other model's rates", () => {
  const rs = [rec({ fresh: 1e6, output: 1e6 })];
  const r = modelSwitchSavings(rs, RATES, "model-a", "model-b", 1);
  assert.equal(r.current, 18);
  assert.equal(r.after, 5);
  assert.equal(r.savings, 13);
  assert.equal(modelSwitchSavings(rs, RATES, "model-a", "model-b", 0.5).savings, 6.5);
  assert.throws(() => modelSwitchSavings(rs, RATES, "model-a", "nope", 1), /No rate/);
  assert.throws(() => modelSwitchSavings(rs, RATES, "model-a", "model-b", 2), /between 0 and 1/);
});

test("reportText is a plain summary that names unpriced models", () => {
  const a = analyze([rec({ fresh: 1e6 }), rec({ model: "mystery", fresh: 5 })], RATES);
  const text = reportText(a);
  assert.match(text, /2 requests, \$3\.00/);
  assert.match(text, /Not priced.*mystery/);
});
