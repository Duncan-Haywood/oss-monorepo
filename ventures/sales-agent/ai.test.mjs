import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mergeTriage, runInboxWithModel } from "./ai.mjs";
import { triage, SAMPLE_REPLIES, SAMPLE_PROSPECTS, SAMPLE_OFFER } from "./engine.mjs";

const T = "2026-10-21";
const anthropic = (texts) => { let i = 0; return async () => ({ ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: typeof texts === "function" ? texts(i++) : texts[Math.min(i++, texts.length - 1)] }] }), text: async () => "" }); };
const cfg = { provider: "anthropic", apiKey: "sk-test" };

test("byok.mjs is a synced copy of platform/llm/byok.mjs", () => {
  assert.equal(readFileSync(new URL("./byok.mjs", import.meta.url), "utf8"), readFileSync(new URL("../../platform/llm/byok.mjs", import.meta.url), "utf8"));
});

test("merge: the model may lower contact, never raise it", () => {
  const unsub = triage({ body: "Please remove me" }, T);
  assert.equal(mergeTriage(unsub, { category: "interested" }, T).category, "unsubscribe");
  const notInt = triage({ body: "No thanks." }, T);
  const m = mergeTriage(notInt, { category: "interested" }, T);
  assert.equal(m.category, "not_interested");
  assert.equal(m.modelSaid, "interested");
  assert.equal(mergeTriage(triage({ body: "ok" }, T), { category: "interested", evidence: "ok" }, T).category, "interested");
  assert.equal(mergeTriage(triage({ body: "Sounds interesting, tell me more" }, T), { category: "unsubscribe" }, T).category, "unsubscribe");
  assert.equal(mergeTriage(triage({ body: "ok" }, T), { category: "made_up" }, T).source, "rules");
  const nn = mergeTriage(triage({ body: "hmm" }, T), { category: "not_now", return_date: "2027-02-01" }, T);
  assert.equal(nn.date, "2027-02-01");
  assert.equal(mergeTriage(triage({ body: "hmm" }, T), { category: "objection", subtype: "weird" }, T).subtype, "need");
});

test("no key: rules run and the result says so", async () => {
  const r = await runInboxWithModel({}, { replies: SAMPLE_REPLIES, prospects: SAMPLE_PROSPECTS, offer: SAMPLE_OFFER, today: T });
  assert.equal(r.source, "rules");
  assert.equal(r.items.length, 6);
});

test("with a model: triage merged, drafts polished only if they pass the checks", async () => {
  const replies = "From: a@x.example\nSubject: Re: hi\nGo on then, convince me. 20 minutes Thursday?\n---\nFrom: b@x.example\nPlease remove me.";
  const fetch = anthropic((i) => i === 0 ? '{"category":"interested","subtype":null,"return_date":null,"evidence":"20 minutes Thursday?"}' : "Hi a,\n\nThanks. Our customers save 50% guaranteed.\n\nSam Ortiz\nReply unsubscribe to stop.");
  const r = await runInboxWithModel(cfg, { replies, offer: SAMPLE_OFFER, today: T }, { fetch });
  assert.equal(r.source, "model");
  assert.equal(r.items[0].triage.category, "interested");
  assert.equal(r.items[0].triage.source, "model");
  assert.equal(r.items[0].draft.source, "fallback"); // the model's draft invented 50% and a guarantee
  assert.ok(r.errors.some((e) => /failed the checks/.test(e)));
  assert.equal(r.items[1].triage.category, "unsubscribe"); // decided by rules; the model was not asked
  assert.equal(r.suppression.length, 1);
});

test("a model that returns junk falls back to the rules for that reply", async () => {
  const r = await runInboxWithModel(cfg, { replies: "From: a@x.example\nNo thanks.", today: T }, { fetch: anthropic(["not json at all"]) });
  assert.equal(r.items[0].triage.category, "not_interested");
  assert.equal(r.items[0].triage.source, "rules");
  assert.ok(r.errors.length >= 1);
});
