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
  // A model's stop is a flag, not an action (2026-11-12): the rules' answer stands and modelSaid carries the model's reading.
  const flagged = mergeTriage(triage({ body: "Sounds interesting, tell me more" }, T), { category: "unsubscribe", evidence: "tell me more" }, T);
  assert.equal(flagged.category, "interested");
  assert.equal(flagged.modelSaid, "unsubscribe");
  const unclearStop = mergeTriage(triage({ body: "hmm" }, T), { category: "unsubscribe" }, T);
  assert.equal(unclearStop.category, "unclear");
  assert.equal(unclearStop.modelSaid, "unsubscribe");
  assert.equal(mergeTriage(triage({ body: "Can you resend the attachment? It didn't open." }, T), { category: "bounce" }, T).modelSaid, "bounce");
  // Nor does it pause a reply the rules read as interested (2026-11-12).
  const hot = mergeTriage(triage({ body: "Call me later today, around 3pm. I'm free after lunch." }, T), { category: "not_now" }, T);
  assert.equal(hot.category, "interested");
  assert.equal(hot.modelSaid, "not_now");
  // Never from a no-draft category to a drafting one, even at the same rank (an away notice read as "not now").
  const away = mergeTriage(triage({ from: "a@x.example", subject: "Automatic reply: hi", body: "I am out of the office until 3 November with limited access to email." }, T), { category: "not_now" }, T);
  assert.equal(away.category, "out_of_office");
  assert.equal(away.modelSaid, "not_now");
  assert.equal(mergeTriage(triage({ body: "ok" }, T), { category: "made_up" }, T).source, "rules");
  const nn = mergeTriage(triage({ body: "hmm" }, T), { category: "not_now", return_date: "2027-02-01" }, T);
  assert.equal(nn.date, "2027-02-01");
  assert.equal(mergeTriage(triage({ body: "hmm" }, T), { category: "objection", subtype: "weird" }, T).subtype, "need");
});

test("merge: a model's close of a reply a person would read is a flag, and a question stays a question (2026-11-12)", async () => {
  // eval/README.md "The 37 false stops, by what a person would see": a 7B model closed "ok" and "Our team is pretty attached
  // to the spreadsheet" (no draft, no task: lost unread), and turned "What does it cost for a team of 12?" into an objection.
  for (const [body, said] of [["ok", "not_interested"], ["Our team is pretty attached to the spreadsheet we've used for years.", "not_interested"], ["I'm the wrong person to convince. Our CEO hates cold email tools and will say no.", "left_company"]]) {
    const rules = triage({ body }, T), m = mergeTriage(rules, { category: said }, T);
    assert.equal(m.category, rules.category, body);
    assert.equal(m.modelSaid, said, body);
  }
  const obj = triage({ body: "We already have Salesforce and it does everything we need." }, T);
  assert.equal(obj.category, "objection");
  assert.equal(mergeTriage(obj, { category: "not_interested" }, T).category, "objection");
  const q = triage({ body: "What does it cost for a team of 12?" }, T);
  assert.equal(q.category, "question");
  const mq = mergeTriage(q, { category: "objection", subtype: "price" }, T);
  assert.equal(mq.category, "question");
  assert.equal(mq.modelSaid, "objection");
  // A close the rules agree with, or one from a category a person does not read, still goes through.
  assert.equal(mergeTriage(triage({ body: "No thanks." }, T), { category: "left_company" }, T).category, "left_company");
  // In the inbox run the person sees the model's reading: on an unclear reply as the guess, on an objection as a task.
  const replies = "From: a@x.example\nSubject: Re: hi\nok\n---\nFrom: b@x.example\nSubject: Re: hi\nWe already have Salesforce and it does everything we need.";
  const fetch = anthropic(['{"category":"not_interested","subtype":null,"return_date":null,"evidence":"ok"}', '{"category":"not_interested","subtype":null,"return_date":null,"evidence":"We already have Salesforce"}', "Hi,\n\nThanks.\n\nSam Ortiz\nReply unsubscribe to stop."]);
  const r = await runInboxWithModel(cfg, { replies, offer: SAMPLE_OFFER, today: T }, { fetch });
  assert.equal(r.items[0].triage.category, "unclear");
  assert.equal(r.items[0].triage.guess.category, "not_interested");
  assert.ok(r.tasks.some((t) => t.email === "a@x.example" && /The model reads it as not interested/.test(t.task)));
  assert.ok(!r.tasks.some((t) => t.email === "a@x.example" && /plain no/.test(t.task)), "one task per reply");
  assert.equal(r.items[1].triage.category, "objection");
  assert.ok(r.tasks.some((t) => t.email === "b@x.example" && /plain no/.test(t.task)));
  assert.equal(r.prospects.find((p) => p.email === "a@x.example").status, "paused");
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

test("a model's opt-out is a flag for a person, never a suppression by itself", async () => {
  const replies = "From: a@x.example\nSubject: Re: hi\nDo you handle unsubscribe links and suppression lists for us?\n---\nFrom: b@x.example\nSubject: Re: hi\nhmm";
  const fetch = anthropic((i) => i < 2 ? '{"category":"unsubscribe","subtype":null,"return_date":null,"evidence":"unsubscribe links"}' : "Hi,\n\nThanks for asking.\n\nSam Ortiz\nReply unsubscribe to stop.");
  const r = await runInboxWithModel(cfg, { replies, offer: SAMPLE_OFFER, today: T }, { fetch });
  assert.equal(r.items[0].triage.category, "question");
  assert.equal(r.items[1].triage.category, "unclear");
  assert.equal(r.suppression.length, 0);
  assert.ok(r.prospects.every((p) => p.status !== "unsubscribed"));
  assert.equal(r.tasks.filter((t) => /model reads this reply as a request to stop/.test(t.task)).length, 2);
});

test("a misspelt category from a small model is mapped, not thrown away", async () => {
  const { modelTriage } = await import("./ai.mjs");
  const t = await modelTriage(cfg, { subject: "Re: hi", body: "We're not interested." }, T, { fetch: anthropic(['{"category":"uninterested","subtype":null,"return_date":null,"evidence":"x"}']) });
  assert.equal(t.category, "not_interested");
  await assert.rejects(modelTriage(cfg, { body: "x" }, T, { fetch: anthropic(['{"category":"maybe"}']) }), /unknown category/);
});
