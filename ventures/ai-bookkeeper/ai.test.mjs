import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { aiSuggest, aiPrompt, parseReply } from "./ai.mjs";
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
