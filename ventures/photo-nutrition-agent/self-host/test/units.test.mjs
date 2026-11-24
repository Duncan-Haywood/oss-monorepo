import { test } from "node:test";
import assert from "node:assert/strict";
import { toGrams, atwaterGap, referenceItem, localDate, mealTotals } from "../nutrition.mjs";
import { normalizeAnalysis } from "../analyze.mjs";
import { hamming } from "../pipeline.mjs";
import { ols, energyBalance, nutritionHistory } from "../analytics.mjs";
import { openStore } from "../store.mjs";
import { createMeal } from "../meals.mjs";
import { updateTargets } from "../policy.mjs";
import { addDays } from "../nutrition.mjs";
import { handleMcp } from "../mcp.mjs";

test("unit conversion", () => {
  assert.equal(Math.round(toGrams({ value: 12, unit: "oz" }).grams), 340);
  assert.equal(Math.round(toGrams({ value: 1.5, unit: "lb" }).grams), 680);
  assert.equal(Math.round(toGrams({ value: 2, unit: "tbsp" }, { density: 0.91 }).grams), 27);
  assert.match(toGrams({ value: 1, unit: "cup" }).assumption, /water density/);
  assert.throws(() => toGrams({ value: 2, unit: "each" }), /give a weight/);
  assert.throws(() => toGrams({ value: 1, unit: "handful" }), /unknown unit/);
});

test("reference foods resolve common corrections", () => {
  const eggs = referenceItem("eggs", { value: 3, unit: "each" });
  assert.equal(eggs.grams, 150);
  assert.equal(eggs.nutrients.energy_kcal, 215);
  assert.equal(eggs.source, "reference");
  assert.equal(referenceItem("dragonfruit", { value: 1, unit: "each" }), null);
});

test("Atwater consistency flags estimates whose energy disagrees with their macros", () => {
  assert.ok(atwaterGap({ energy_kcal: 460, protein_g: 66, carbs_g: 0, fat_g: 21 }) < 0.05);
  assert.ok(atwaterGap({ energy_kcal: 900, protein_g: 10, carbs_g: 10, fat_g: 5 }) > 0.5);
  const a = normalizeAnalysis({ kind: "meal", overall_confidence: 0.9, consumed_likelihood: 0.9, items: [{ name: "x", confidence: 0.9, nutrients: { energy_kcal: 900, protein_g: 10, carbs_g: 10, fat_g: 5 } }] });
  assert.ok(a.items[0].confidence <= 0.4);
  assert.ok(a.overall_confidence <= 0.5);
  assert.equal(a.flags.length, 1);
});

test("normalizeAnalysis survives junk", () => {
  const a = normalizeAnalysis({ kind: "weird", items: [{ name: "x", nutrients: { energy_kcal: -5 } }, null, { nutrients: {} }] });
  assert.equal(a.kind, "not_food");
  assert.equal(a.items.length, 0);
});

test("energy range widens with lower confidence; labels count as exact", () => {
  const t = mealTotals([
    { nutrients: { energy_kcal: 100 }, source: "estimate", confidence: 1 },
    { nutrients: { energy_kcal: 100 }, source: "label" },
  ]);
  assert.deepEqual(t.energy_kcal_range, [185, 215]);
});

test("hamming distance on 64-bit hex hashes", () => {
  assert.equal(hamming("0000000000000000", "000000000000000f"), 4);
  assert.equal(hamming("ffffffffffffffff", "0000000000000000"), 64);
  assert.equal(hamming(null, "00"), Infinity);
});

test("local dates follow the IANA zone, falling back to the offset", () => {
  assert.equal(localDate("2026-03-08T06:30:00Z", { timeZone: "America/Los_Angeles" }), "2026-03-07");
  assert.equal(localDate("2026-11-20T23:30:00Z", { offsetMin: 540 }), "2026-11-21");
  assert.equal(localDate("2026-11-20T23:30:00Z", { timeZone: "Not/AZone", offsetMin: 540 }), "2026-11-21");
});

test("OLS recovers a known slope", () => {
  const xs = [0, 1, 2, 3, 4, 5];
  const f = ols(xs, xs.map((x) => 100 - 0.1 * x));
  assert.ok(Math.abs(f.slope + 0.1) < 1e-9);
  assert.ok(f.se < 1e-9);
});

test("energy balance: constant 2300 kcal intake while losing 0.5 kg/week implies ~2850 kcal expenditure", () => {
  const store = openStore(":memory:", { now: () => new Date("2026-11-28T12:00:00Z") });
  const to = "2026-11-28";
  for (let i = 0; i < 28; i++) {
    const d = addDays(to, -i);
    createMeal(store, { name: "day", eaten_at: `${d}T17:00:00Z`, time_zone: "UTC", items: [{ name: "food", source: "user", nutrients: { energy_kcal: 2300, protein_g: 200, carbs_g: 200, fat_g: 77 } }], actor: "test" });
    store.upsertMetric(d, "body_mass_kg", 110 - (0.5 / 7) * (27 - i), "test");
  }
  updateTargets(store, { weekly_weight_change_lb: -1, protein_g: 200 });
  const eb = energyBalance(store, { to, days: 28 });
  assert.equal(eb.days_with_logged_meals, 28);
  assert.ok(Math.abs(eb.estimate.tdee_kcal - 2850) <= 2, String(eb.estimate.tdee_kcal));
  assert.equal(eb.estimate.deficit_kcal_per_day, 550);
  // the 20% intake uncertainty dominates the interval
  assert.ok(eb.estimate.tdee_ci95_kcal[0] < 2000 && eb.estimate.tdee_ci95_kcal[1] > 3700);
  assert.ok(eb.estimate.intake_for_target_rate_kcal > 2300);
  const h = nutritionHistory(store, addDays(to, -6), to);
  assert.equal(h.adherence.protein_days_within_10pct_or_above.pct, 100);
});

test("energy balance declines to estimate from thin data", () => {
  const store = openStore(":memory:", { now: () => new Date("2026-11-28T12:00:00Z") });
  const eb = energyBalance(store, { to: "2026-11-28", days: 28 });
  assert.equal(eb.estimate, null);
  assert.match(eb.reason, /Not enough data/);
});

test("MCP: notifications get 202, unknown methods -32601, batches work, tool errors come back as results", async () => {
  const store = openStore(":memory:");
  const ctx = { store, analyzer: null };
  assert.equal((await handleMcp(ctx, { jsonrpc: "2.0", method: "notifications/initialized" })).status, 202);
  assert.equal((await handleMcp(ctx, { jsonrpc: "2.0", id: 1, method: "nope" })).body.error.code, -32601);
  const batch = await handleMcp(ctx, [{ jsonrpc: "2.0", id: 1, method: "ping" }, { jsonrpc: "2.0", method: "notifications/initialized" }]);
  assert.equal(batch.body.length, 1);
  const err = await handleMcp(ctx, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "get_meal", arguments: { meal_id: "missing" } } });
  assert.equal(err.body.result.isError, true);
  const badArgs = await handleMcp(ctx, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_daily_totals", arguments: { date: "yesterday" } } });
  assert.match(badArgs.body.result.content[0].text, /wrong format/);
  const unknown = await handleMcp(ctx, { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "drop_tables", arguments: {} } });
  assert.equal(unknown.body.error.code, -32602);
});

test("log_meal without nutrients and without an analyzer explains what to send", async () => {
  const store = openStore(":memory:");
  const r = await handleMcp({ store, analyzer: null }, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "log_meal", arguments: { items: [{ name: "pad thai" }] } } });
  assert.match(r.body.result.content[0].text, /include nutrients/);
});

test("correction errors name the items so the model can retry", async () => {
  const store = openStore(":memory:");
  const ctx = { store, analyzer: null };
  const m = createMeal(store, { name: "plate", items: [{ name: "rice", grams: 200, nutrients: { energy_kcal: 260 } }, { name: "chicken breast", grams: 150, nutrients: { energy_kcal: 250 } }], actor: "test" });
  const r = await handleMcp(ctx, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "update_meal", arguments: { meal_id: m.id, operations: [{ op: "set_amount", item: "salmon", amount: { value: 6, unit: "oz" } }] } } });
  assert.match(r.body.result.content[0].text, /rice .*chicken breast/);
  assert.equal(store.meal(m.id).version, 1, "a failed correction writes nothing");
});

test("openAiAnalyzer sends an image + strict JSON schema request and classifies failures", async () => {
  const { openAiAnalyzer } = await import("../analyze.mjs");
  const seen = [];
  const reply = { kind: "meal", consumed_likelihood: 0.9, relation_to_recent_meal: "none", meal_name: "toast", overall_confidence: 0.8, items: [{ name: "toast", grams: 40, preparation: null, confidence: 0.8, energy_low_kcal: 90, energy_high_kcal: 130, nutrients: { energy_kcal: 110, protein_g: 4, carbs_g: 20, fat_g: 1.5, fiber_g: 2, sugar_g: 2, sat_fat_g: 0.3, sodium_mg: 180 } }], label: null, notes: "" };
  let status = 200;
  const fetchImpl = async (url, init) => {
    seen.push({ url, init: JSON.parse(init.body), auth: init.headers.authorization });
    if (status !== 200) return new Response("busy", { status });
    return new Response(JSON.stringify({ model: "m", choices: [{ message: { content: JSON.stringify(reply) } }], usage: { total_tokens: 1 } }), { status: 200 });
  };
  const a = openAiAnalyzer({ apiKey: "k", model: "m", baseUrl: "https://example.test/v1/", fetchImpl });
  const out = await a.analyzeImage({ imageBase64: "aGk=", context: {} });
  assert.equal(out.items[0].name, "toast");
  assert.equal(seen[0].url, "https://example.test/v1/chat/completions");
  assert.equal(seen[0].auth, "Bearer k");
  assert.equal(seen[0].init.response_format.json_schema.strict, true);
  assert.match(seen[0].init.messages[1].content[1].image_url.url, /^data:image\/jpeg;base64,aGk=$/);
  status = 429;
  await assert.rejects(a.analyzeImage({ imageBase64: "aGk=" }), (e) => e.retryable === true);
  status = 400;
  await assert.rejects(a.analyzeImage({ imageBase64: "aGk=" }), (e) => e.retryable === false);
  assert.equal(openAiAnalyzer({ apiKey: "" }), null);
});
