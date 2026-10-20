import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { draftReply, replyPrompt, SYSTEM } from "./ai.mjs";

const review = { reviewer: "Tom R", rating: 1, body: "Waited an hour and the waiter was rude." };
const profile = { business: "Luigi's", owner: "Luigi", contact: "555-123-4567", type: "restaurant" };
const reply = (text) => async () => ({ ok: true, status: 200, json: async () => ({ content: [{ type: "text", text }] }), text: async () => "" });

test("byok.mjs is a synced copy of platform/llm/byok.mjs", () => {
  const here = readFileSync(new URL("./byok.mjs", import.meta.url), "utf8");
  const root = readFileSync(new URL("../../platform/llm/byok.mjs", import.meta.url), "utf8");
  assert.equal(here, root);
});

test("no key: the template reply is used and the source says so", async () => {
  const r = await draftReply({}, review, profile);
  assert.equal(r.source, "fallback");
  assert.match(r.reply, /555-123-4567/);
  assert.deepEqual(r.lint.errors, []);
});

test("a clean model reply is used", async () => {
  const text = "Hi Tom, we are sorry the wait ran so long. Please contact Luigi at 555-123-4567 so we can hear what happened. Luigi";
  const r = await draftReply({ provider: "anthropic", apiKey: "k" }, review, profile, { fetch: reply(text) });
  assert.equal(r.source, "model");
  assert.equal(r.reply, text);
});

test("a model reply that offers a review change falls back to the template", async () => {
  const r = await draftReply({ provider: "anthropic", apiKey: "k" }, review, profile, { fetch: reply("Sorry Tom. Please update your review and we will make it right.") });
  assert.equal(r.source, "fallback");
  assert.match(r.error, /failed the checks/);
});

test("the prompt carries the contact line and the system prompt bans offers", () => {
  assert.match(replyPrompt(review, profile), /555-123-4567/);
  assert.match(SYSTEM, /Never offer a refund/);
});
