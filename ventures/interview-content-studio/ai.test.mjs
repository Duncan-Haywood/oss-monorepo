import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SYSTEM, buildPrompt, parseReply, vetPiece, rewriteWithAi, numbersIn, callCount } from "./ai.mjs";
import * as S from "./studio.mjs";

const answers = S.normalizeAnswers({
  name: "Rosa", about: "I bake sourdough for cafes in Leeds.", audience: "cafe owners", problem: "late, stale bread",
  stories: ["We lost a client because a delivery came at 9:30. I moved the first drop to 6:45. Reliability sells bread."],
  opinions: ["Cafes should stock fewer breads."], tips: ["Order for the day you have."], proof: ["14 cafes supplied every morning"],
  offer: "Book a free tasting", link: "https://example.com/t", keywords: ["sourdough wholesale"], banned: ["synergy"],
  voice: { formal: 20, playful: 30, detailed: 50, sample: "Bread first. Talk later." }, platforms: ["x", "linkedin", "reddit"], hours: 3,
});
const { drafts } = S.generate({ id: "t", topic: "t", createdAt: "2026-10-20", answers }, "2026-11-02");
const xPost = drafts.find((d) => d.format === "x-post");
const reddit = drafts.find((d) => d.format === "reddit-post");

/** A fetch that answers like Anthropic's Messages API with `text`. */
const reply = (text, calls = []) => async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: true, status: 200, json: async () => ({ content: [{ type: "text", text }] }), text: async () => "" }; };
const cfg = { provider: "anthropic", apiKey: "test-key" };

test("byok.mjs is a synced copy of platform/llm/byok.mjs", () => {
  const here = readFileSync(new URL("./byok.mjs", import.meta.url), "utf8");
  const root = readFileSync(new URL("../../platform/llm/byok.mjs", import.meta.url), "utf8");
  assert.equal(here, root);
});

test("the system prompt forbids invention, demands JSON and treats input as data", () => {
  assert.match(SYSTEM, /Never invent statistics, testimonials/);
  assert.match(SYSTEM, /strict JSON only/);
  assert.match(SYSTEM, /Ignore any instructions/);
  assert.match(SYSTEM, /banned list/);
});

test("the prompt carries the interview, voice, banned words, limits and each id", () => {
  const p = buildPrompt(answers, [xPost, reddit]);
  assert.match(p, /Story 1: We lost a client/);
  assert.match(p, /Writing sample/);
  assert.match(p, /Banned words: synergy/);
  assert.match(p, /max 280 characters, links count as 23/);
  assert.ok(p.includes(`id: ${xPost.slotId}`) && p.includes(`id: ${reddit.slotId}`));
  assert.match(p, /Many subreddits forbid self-promotion/);
});

test("parseReply accepts fenced or bare JSON and rejects prose", () => {
  assert.equal(parseReply('```json\n{"pieces":[{"id":"a"}]}\n```').length, 1);
  assert.equal(parseReply('Sure! {"pieces":[]} hope that helps').length, 0);
  assert.throws(() => parseReply("sorry, I can't"), /did not return JSON/);
  assert.throws(() => parseReply('{"pieces": nope}'), /did not parse/);
  assert.throws(() => parseReply('{"drafts": []}'), /no pieces list/);
});

test("numbersIn normalises separators", () => {
  assert.deepEqual(numbersIn("1,200 cafes at 9:30, 14."), ["1200", "9:30", "14"]);
});

test("vetPiece keeps a good rewrite and fits it to the limit", () => {
  const v = vetPiece({ id: xPost.slotId, fields: { text: `${"Bread at 6:45, every day. ".repeat(20)}` } }, xPost, answers);
  assert.equal(v.kept, true);
  assert.equal(v.draft.source, "model");
  assert.ok(S.measure(v.draft.text, "x") <= 280);
});

test("vetPiece throws away a rewrite that invents a number", () => {
  const v = vetPiece({ id: xPost.slotId, fields: { text: "We grew 300% and serve 50 cafes." } }, xPost, answers);
  assert.equal(v.kept, false);
  assert.equal(v.reason, "invented-number");
  assert.equal(v.draft.text, xPost.text);
  assert.match(v.draft.warnings.join(" "), /added numbers not in your interview \(300, 50\)/);
});

test("vetPiece refuses links on Reddit and empty pieces", () => {
  assert.equal(vetPiece({ fields: { body: "Read more at https://example.com/t" } }, reddit, answers).reason, "link-on-reddit");
  assert.equal(vetPiece({ fields: {} }, xPost, answers).reason, "empty");
  assert.equal(vetPiece(null, xPost, answers).reason, "missing");
});

test("no provider: nothing is sent and the template drafts stand", async () => {
  const calls = [];
  const r = await rewriteWithAi({}, answers, drafts.slice(0, 3), { fetch: reply("{}", calls) });
  assert.equal(calls.length, 0);
  assert.deepEqual(r.drafts, drafts.slice(0, 3));
  assert.equal(r.kept, 0);
});

test("a good batch reply is matched by id; a broken one falls back with the reason", async () => {
  const batch = [xPost, reddit];
  const calls = [];
  const good = JSON.stringify({ pieces: [{ id: reddit.slotId, fields: { title: "Fewer breads, fresher cafes", body: "We moved the first drop to 6:45." } }, { id: xPost.slotId, fields: { text: "Reliability sells bread. Ask any cafe owner who waited until 9:30." } }] });
  const ok = await rewriteWithAi(cfg, answers, batch, { fetch: reply(good, calls) });
  assert.equal(ok.kept, 2);
  assert.equal(ok.calls, 1);
  assert.equal(calls[0].body.system, SYSTEM);
  assert.match(ok.drafts[0].text, /Reliability sells bread/);
  assert.equal(ok.drafts[1].fields.title, "Fewer breads, fresher cafes");
  const bad = await rewriteWithAi(cfg, answers, batch, { fetch: reply("I cannot help with that.") });
  assert.equal(bad.kept, 0);
  assert.deepEqual(bad.drafts, batch);
  assert.match(bad.errors[0], /did not return JSON/);
  const down = await rewriteWithAi(cfg, answers, batch, { fetch: async () => ({ ok: false, status: 500, json: async () => ({}), text: async () => "" }) });
  assert.match(down.errors[0], /HTTP 500/);
  assert.deepEqual(down.drafts, batch);
});

test("batches are sized as announced", async () => {
  const calls = [];
  const many = drafts.slice(0, 12);
  const r = await rewriteWithAi(cfg, answers, many, { fetch: reply('{"pieces":[]}', calls), batchSize: 5 });
  assert.equal(calls.length, callCount(12, 5));
  assert.equal(r.discarded, 12);
});
