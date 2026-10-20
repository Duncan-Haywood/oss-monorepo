import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { draftEmail, emailPrompt, SYSTEM } from "./ai.mjs";
import { analyzeCall, SAMPLE_NOTES } from "./calc.mjs";

const a = analyzeCall(SAMPLE_NOTES, { rep: "Me", today: "2026-10-17" });
const meta = { contact: "Dana Reyes", you: "Sam", company: "Brightline" };
const reply = (text) => async () => ({ ok: true, status: 200, json: async () => ({ content: [{ type: "text", text }] }), text: async () => "" });

test("byok.mjs is a synced copy of platform/llm/byok.mjs", () => {
  const here = readFileSync(new URL("./byok.mjs", import.meta.url), "utf8");
  const root = readFileSync(new URL("../../platform/llm/byok.mjs", import.meta.url), "utf8");
  assert.equal(here, root);
});

test("no key: the built-in recap is used and the source says so", async () => {
  const r = await draftEmail({}, SAMPLE_NOTES, a, meta);
  assert.equal(r.source, "fallback");
  assert.match(r.body, /Hi Dana/);
  assert.deepEqual(r.lint.errors, []);
});

test("a clean model email is used", async () => {
  const text = "Hi Dana, thanks for walking me through the weekly routes. I will send the sample comparison by Tuesday and book time with Marcus next Thursday. Sam";
  const r = await draftEmail({ provider: "anthropic", apiKey: "k" }, SAMPLE_NOTES, a, meta, { fetch: reply(text) });
  assert.equal(r.source, "model");
  assert.equal(r.body, text);
});

test("a model email that invents a price falls back to the built-in recap", async () => {
  const r = await draftEmail({ provider: "anthropic", apiKey: "k" }, SAMPLE_NOTES, a, meta, { fetch: reply("Hi Dana, we can do it for $9,000 a year. Sam") });
  assert.equal(r.source, "fallback");
  assert.match(r.error, /failed the checks/);
  assert.match(r.body, /What I heard/);
});

test("the prompt carries the notes and the system prompt bans invention", () => {
  assert.match(emailPrompt(SAMPLE_NOTES, "draft", meta), /Brightline Logistics/);
  assert.match(SYSTEM, /Never add a price/);
});
