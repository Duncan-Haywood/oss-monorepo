import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { aiSuggest, aiPrompt, parseReply } from "./ai.mjs";
import { runSeed } from "./eval/ai-eval.mjs";
import { newBooks, importStatement, categorize, acceptSuggestions } from "./engine.mjs";

const CSV = "Date,Description,Amount\n2026-01-03,ZQX STUDIO RENTALS,-300.00\n2026-01-04,MYSTERY LLC,-12.00\n";
const reply = (text) => async () => ({ ok: true, status: 200, json: async () => ({ content: [{ type: "text", text }] }), text: async () => "" });
const books = () => importStatement(newBooks(), CSV, "1000").books;

test("byok.mjs is a synced copy of platform/llm/byok.mjs", () => {
  const here = readFileSync(new URL("./byok.mjs", import.meta.url), "utf8");
  const root = readFileSync(new URL("../../platform/llm/byok.mjs", import.meta.url), "utf8");
  assert.equal(here, root);
});

test("no key: nothing changes and the source says so", async () => {
  const b = books();
  const r = await aiSuggest({}, b);
  assert.equal(r.source, "fallback");
  assert.equal(r.books, b);
});

test("a model suggestion lands in review, never posted, and survives recategorising", async () => {
  const b = books();
  const [a, m] = b.transactions;
  const text = 'Sure! ```json\n{"lines":[{"id":"' + a.id + '","account":"6080","confidence":0.8,"reason":"studio rental"},{"id":"' + m.id + '","account":"7777","confidence":0.9,"reason":"made up"}]}\n```';
  const r = await aiSuggest({ provider: "anthropic", apiKey: "k" }, b, { fetch: reply(text) });
  assert.equal(r.source, "model");
  assert.equal(r.suggested, 1);
  assert.equal(r.dropped, 1, "an account not in the chart is dropped");
  const t = r.books.transactions.find((x) => x.id === a.id);
  assert.equal(t.status, "review");
  assert.equal(t.suggestion.source, "ai");
  assert.equal(t.suggestion.account, "6080");
  const again = categorize(r.books).transactions.find((x) => x.id === a.id);
  assert.equal(again.suggestion.source, "ai");
  assert.equal(acceptSuggestions(r.books, 0.7).transactions.find((x) => x.id === a.id).posted, "6080");
});

test("an answer with no valid account falls back", async () => {
  const b = books();
  const r = await aiSuggest({ provider: "anthropic", apiKey: "k" }, b, { fetch: reply('{"lines":[{"id":"nope","account":"6080"}]}') });
  assert.equal(r.source, "fallback");
  assert.match(r.error, /no account/);
});

test("the prompt carries the chart and only the review lines", () => {
  const b = books();
  const p = aiPrompt(b, b.transactions.slice(0, 1));
  assert.match(p, /6060 Software and subscriptions \(expense\)/);
  assert.match(p, /ZQX STUDIO RENTALS/);
  assert.doesNotMatch(p, /MYSTERY/);
  assert.throws(() => parseReply("no json here"), /JSON/);
});

test("aiSuggest batches with an offset", async () => {
  const b = books();
  const [, m] = b.transactions;
  const r = await aiSuggest({ provider: "anthropic", apiKey: "k" }, b, { max: 1, offset: 1, fetch: reply('{"lines":[{"id":"' + m.id + '","account":"6070","confidence":0.6,"reason":"x"}]}') });
  assert.equal(r.suggested, 1);
  assert.equal(r.books.transactions[1].suggestion.source, "ai");
});

test("ai-eval harness: a perfect scripted model is right on every review line", async () => {
  const t = await runSeed(1, { config: { provider: "anthropic", apiKey: "stub" }, stub: 1, from: 11, mode: "replace" });
  assert.ok(t.review > 20);
  assert.equal(t.aiRight, t.review);
  assert.equal(t.broken, 0);
  assert.equal(t.failedCalls, 0);
});

test("parseReply reads the shapes small local models actually return", () => {
  const raw = '[\n {"id":"a","account":"1000 Checking (asset)","reason":"has } and \\" inside"},\n {"id":"b","account":"6000 X"}\n]';
  assert.deepEqual(parseReply(raw).map((x) => x.id), ["a", "b"]); // bare array (qwen2.5:3b)
  assert.deepEqual(parseReply("Sure:\n```json\n" + raw + "\n```").map((x) => x.id), ["a", "b"]);
  assert.deepEqual(parseReply('{"lines":[{"id":"c"}]}').map((x) => x.id), ["c"]);
  assert.deepEqual(parseReply('{"id":"d","account":"1"}\n{"id":"e","account":"2"} thanks {done}').map((x) => x.id), ["d", "e"]); // loose objects
  assert.throws(() => parseReply('{"foo":1}'), /lines/);
});

test("fill mode (default) sends only lines with no deterministic suggestion; replace mode sends all", async () => {
  const b = books();
  b.transactions[0].suggestion = { account: "6080", confidence: 0.6, source: "keyword", reason: "k", alternatives: [] };
  let sent = "";
  const spy = async (_u, init) => { sent = init.body; return reply('{"lines":[]}')(); };
  await aiSuggest({ provider: "anthropic", apiKey: "k" }, b, { fetch: spy });
  assert.ok(!sent.includes(b.transactions[0].id), "a line with a suggestion stays home");
  assert.ok(sent.includes(b.transactions[1].id));
  await aiSuggest({ provider: "anthropic", apiKey: "k" }, b, { fetch: spy, mode: "replace" });
  assert.ok(sent.includes(b.transactions[0].id));
  const all = books(); for (const t of all.transactions) t.suggestion = { account: "6080", confidence: 0.6, source: "keyword", alternatives: [] };
  const r = await aiSuggest({ provider: "anthropic", apiKey: "k" }, all, { fetch: spy });
  assert.equal(r.source, "fallback");
  assert.match(r.error, /already has a suggestion/);
});

test("ai-eval harness: fill mode sends only lines with no suggestion and breaks none", async () => {
  const t = await runSeed(1, { config: { provider: "anthropic", apiKey: "stub" }, stub: 0.5, from: 11 });
  assert.equal(t.broken, 0);
  assert.equal(t.aiAnswered, t.detNone);
});

test("parseReply keeps a bare array as is, and the prompt caps past examples at 40", () => {
  // A bare array of non-objects or id-less objects only survives the whole-array parse, not the loose-object scan.
  assert.deepEqual(parseReply('["a","b"]'), ["a", "b"]);
  assert.deepEqual(parseReply('ok [{"x":1}] done'), [{ x: 1 }]);
  const b = books();
  const past = Array.from({ length: 45 }, (_, i) => ({ id: "p" + i, date: "2026-01-01", cents: -100, desc: "PAST" + i, account: "1000", posted: "6060", status: "confirmed" }));
  const p = aiPrompt({ ...b, transactions: [...past, ...b.transactions] }, b.transactions.slice(0, 1));
  assert.equal((p.match(/PAST\d+/g) || []).length, 40);
  assert.doesNotMatch(p, /PAST4\b/);
  assert.match(p, /PAST44/);
});
