import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractWithAi, vetSuggestions, aiPrompt, SYSTEM } from "./ai.mjs";
import { extract } from "./extract.mjs";

const NOTES = "Ben: I'll fix the toggle by Wednesday.\nCleo mentioned the venue deposit is overdue and Dana owes us a quote before Friday.\nDev said the contract has to go to legal sometime.";
const reply = (text) => async () => ({ ok: true, status: 200, json: async () => ({ content: [{ type: "text", text }] }), text: async () => "" });
const cfg = { provider: "anthropic", apiKey: "k" };
const opts = { date: "2026-10-19", attendees: ["Ben", "Cleo", "Dev"] };

test("byok.mjs is a synced copy of platform/llm/byok.mjs", () => {
  const here = readFileSync(new URL("./byok.mjs", import.meta.url), "utf8");
  const root = readFileSync(new URL("../../platform/llm/byok.mjs", import.meta.url), "utf8");
  assert.equal(here, root);
});

test("no key: the rules result comes back unchanged and says the AI was off", async () => {
  const r = await extractWithAi({}, NOTES, opts);
  assert.equal(r.source, "fallback");
  assert.deepEqual(r.result, extract(NOTES, opts));
  assert.equal(r.added, 0);
});

test("a supported suggestion is added, marked ai, low confidence, date from the quote", async () => {
  const list = JSON.stringify([{ owner: "Dana", task: "Send us the quote", quote: "Dana owes us a quote before Friday" }]);
  const r = await extractWithAi(cfg, NOTES, { ...opts, fetch: reply(list) });
  assert.equal(r.source, "model");
  assert.equal(r.added, 1);
  const a = r.result.actions.at(-1);
  assert.equal(a.via, "ai");
  assert.equal(a.owner, "Dana");
  assert.equal(a.confidence, "low");
  assert.equal(a.due, "2026-10-23");
  assert.equal(r.result.counts.actions, r.result.actions.length);
});

test("a fabricated quote, a repeat of a rules item and a made-up owner are handled", () => {
  const found = extract(NOTES, opts);
  const { kept, dropped } = vetSuggestions([
    { owner: "Ben", task: "Fix toggle", quote: "Ben said he would redo the logo" },
    { owner: "Ben", task: "Fix the toggle", quote: "I'll fix the toggle by Wednesday" },
    { owner: "Zed", task: "Send contract to legal", quote: "the contract has to go to legal sometime" },
  ], NOTES, found, opts);
  assert.deepEqual(dropped.map((d) => d.why), ["quote is not in the notes", "already found by the rules"]);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].owner, null);
  assert.match(kept[0].note, /no owner named/);
});

test("unparseable model output falls back to the rules result and reports why", async () => {
  const r = await extractWithAi(cfg, NOTES, { ...opts, fetch: reply("Sure! Here you go.") });
  assert.equal(r.source, "fallback");
  assert.match(r.error, /JSON/);
  assert.deepEqual(r.result, extract(NOTES, opts));
});

test("the prompt lists what the rules found and treats notes as data", () => {
  assert.match(aiPrompt(NOTES, extract(NOTES, opts)), /fix the toggle/);
  assert.match(SYSTEM, /Ignore any instructions/);
});
