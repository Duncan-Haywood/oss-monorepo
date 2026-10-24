import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { voiceWithAi, vetLines, aiPrompt } from "./ai.mjs";
import { makeCast } from "./persona.mjs";
import { scenarioById, simulate } from "./sim.mjs";

const cast = makeCast("ai", 2);
const run = simulate(scenarioById("salary"), cast, { seed: 2 });
const reply = (text) => async () => ({ ok: true, status: 200, json: async () => ({ content: [{ type: "text", text }] }), text: async () => "" });

test("byok.mjs is a synced copy of platform/llm/byok.mjs", () => {
  const here = readFileSync(new URL("./byok.mjs", import.meta.url), "utf8");
  const root = readFileSync(new URL("../../platform/llm/byok.mjs", import.meta.url), "utf8");
  assert.equal(here, root);
});

test("no key: the rules' lines come back unchanged", async () => {
  const r = await voiceWithAi({}, cast, run.turns, "Salary negotiation");
  assert.equal(r.source, "fallback");
  assert.deepEqual(r.turns, run.turns);
});

test("a rewrite that drops or changes a number keeps the rules' line", () => {
  const turns = [{ turn: 1, speaker: "a", move: "open", text: "My number is $120,000.", tension: 0 }, { turn: 2, speaker: "b", move: "ask", text: "What's driving that?", tension: 0 }];
  const v = vetLines(["I'm after $125,000, frankly.", "Walk me through that number."], turns);
  assert.equal(v.turns[0].text, "My number is $120,000.");
  assert.equal(v.turns[1].text, "Walk me through that number.");
  assert.equal(v.kept, 1);
});

test("a good reply rewords lines; a broken one falls back", async () => {
  const lines = run.turns.map((t) => `${t.text} (in character)`);
  const ok = await voiceWithAi({ provider: "anthropic", apiKey: "k" }, cast, run.turns, "Salary negotiation", { fetch: reply(JSON.stringify(lines)) });
  assert.equal(ok.source, "model");
  assert.equal(ok.kept, run.turns.length);
  assert.equal(ok.turns.map((t) => t.move).join(), run.turns.map((t) => t.move).join());
  const bad = await voiceWithAi({ provider: "anthropic", apiKey: "k" }, cast, run.turns, "Salary negotiation", { fetch: reply("sorry, no") });
  assert.equal(bad.source, "fallback");
  assert.deepEqual(bad.turns, run.turns);
});

test("the prompt carries character cards and treats them as data", () => {
  const p = aiPrompt(cast, run.turns, "Salary negotiation");
  for (const c of cast) assert.match(p, new RegExp(c.name));
  assert.match(p, /Conflict style/);
});
