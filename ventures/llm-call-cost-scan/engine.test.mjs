import test from "node:test";
import assert from "node:assert/strict";
import { scanSource, estimateMonthly, priceFor, summarize, mergeScans, cheaperSibling } from "./engine.mjs";

const rules = (r) => r.findings.map((f) => f.rule).sort();

test("flags a missing output cap and reads the model literal", () => {
  const r = scanSource(`resp = client.chat.completions.create(\n  model="gpt-4o-mini",\n  messages=m,\n)\n`, "a.py");
  assert.equal(r.calls.length, 1);
  assert.equal(r.calls[0].model, "gpt-4o-mini");
  assert.deepEqual(rules(r), ["no-output-cap"]);
});

test("a capped call on a small model is clean", () => {
  const r = scanSource(`const r = await client.messages.create({ model: "claude-3-5-haiku-latest", max_tokens: 400, messages });\n`, "a.ts");
  assert.deepEqual(r.findings, []);
});

test("max_output_tokens and maxOutputTokens count as caps", () => {
  assert.equal(scanSource(`m.generate_content(p, generation_config={"max_output_tokens": 50})\n`).calls[0].capped, true);
  assert.equal(scanSource(`model.generateContent({ generationConfig: { maxOutputTokens: 50 } });\n`).calls[0].capped, true);
});

test("a cap in a LATER call does not rescue an earlier one", () => {
  const r = scanSource(`a = client.chat.completions.create(model="gpt-4o-mini", messages=m)\n\n\nb = client.chat.completions.create(model="gpt-4o-mini", max_tokens=5, messages=m)\n`);
  assert.equal(r.calls[0].capped, false);
  assert.equal(r.calls[1].capped, true);
});

test("detects a call inside a for loop and inside .map", () => {
  const py = scanSource(`for d in docs:\n    r = client.chat.completions.create(model="gpt-4o-mini", max_tokens=9, messages=d)\n`);
  assert.ok(rules(py).includes("call-in-loop"));
  const js = scanSource(`const out = docs.map(async (d) => {\n  return client.messages.create({ model: "claude-3-haiku", max_tokens: 9, messages: d });\n});\n`);
  assert.ok(rules(js).includes("call-in-loop"));
});

test("a call after, not inside, a loop is not flagged", () => {
  const r = scanSource(`for d in docs:\n    prep(d)\nr = client.chat.completions.create(model="gpt-4o-mini", max_tokens=9, messages=m)\n`);
  assert.ok(!rules(r).includes("call-in-loop"));
});

test("a function boundary stops the loop look-back", () => {
  const r = scanSource(`for d in docs:\n    pass\ndef ask(m):\n    return client.chat.completions.create(model="gpt-4o-mini", max_tokens=9, messages=m)\n`);
  assert.ok(!rules(r).includes("call-in-loop"));
});

test("premium model suggests the same vendor's small tier only", () => {
  const r = scanSource(`client.chat.completions.create(model="gpt-4o", max_tokens=9, messages=m)\n`);
  const f = r.findings.find((x) => x.rule === "premium-model-hardcoded");
  assert.ok(f && f.message.includes("gpt-4o-mini"));
  assert.equal(cheaperSibling("claude-3-opus-20240229").key, "claude-3-haiku");
  assert.equal(cheaperSibling("gpt-4o-mini"), null);
});

test("gpt-4o-mini matches the longer prefix, not gpt-4o", () => {
  assert.equal(priceFor("gpt-4o-mini-2024-07-18").key, "gpt-4o-mini");
  assert.equal(priceFor("gpt-4o-2024-08-06").key, "gpt-4o");
  assert.equal(priceFor("openai/gpt-4o").key, "gpt-4o");
  assert.equal(priceFor("totally-new-model"), null);
});

test("retired names are errors; dated variants of them too", () => {
  const r = scanSource(`openai.chat.completions.create(model="gpt-3.5-turbo-0301", max_tokens=9, messages=m)\n`);
  assert.equal(r.findings.find((f) => f.rule === "retired-model").severity, "error");
  assert.ok(!scanSource(`x.messages.create(model="claude-3-5-sonnet", max_tokens=9)\n`).findings.some((f) => f.rule === "retired-model"));
});

test("a model held in a variable is noted, not priced or tier-flagged", () => {
  const r = scanSource(`client.chat.completions.create(model=MODEL, max_tokens=9, messages=m)\n`);
  assert.deepEqual(rules(r), ["model-not-literal"]);
});

test("commented-out calls are ignored", () => {
  assert.equal(scanSource(`# client.chat.completions.create(model="gpt-4o")\n// client.messages.create({ model: "claude-3-opus" })\n`).calls.length, 0);
});

test("estimateMonthly is plain arithmetic on the stated traffic", () => {
  const calls = scanSource(`c.chat.completions.create(model="gpt-4o", max_tokens=9, messages=m)\n`).calls;
  // (1000*2.5 + 300*10)/1e6 = 0.0055 per call; x1000 x30 = 165
  const e = estimateMonthly(calls, { callsPerDay: 1000, inTokens: 1000, outTokens: 300 });
  assert.ok(Math.abs(e.total - 165) < 1e-9);
  assert.equal(estimateMonthly(scanSource(`c.messages.create(model="unknown-x")\n`).calls).pricedCount, 0);
});

test("custom prices override the built-ins", () => {
  const prices = { "acme-1": { in: 1, out: 2, tier: "small", vendor: "acme" } };
  const calls = scanSource(`c.messages.create(model="acme-1", max_tokens=1)\n`, "", prices).calls;
  assert.equal(estimateMonthly(calls, { callsPerDay: 1000000, inTokens: 1000000, outTokens: 0, days: 1 }, prices).total, 1000000);
});

test("summarize ranks error over warn over ok, and handles none", () => {
  assert.equal(summarize({ calls: [], findings: [] }).status, "none");
  const ok = mergeScans([scanSource(`c.messages.create(model="claude-3-haiku", max_tokens=1)\n`)]);
  assert.equal(summarize(ok).status, "ok");
  assert.equal(summarize(mergeScans([scanSource(`c.messages.create(model="claude-3-haiku")\n`)])).status, "warn");
  assert.equal(summarize(mergeScans([scanSource(`c.messages.create(model="claude-v1", max_tokens=1)\n`)])).status, "error");
});
