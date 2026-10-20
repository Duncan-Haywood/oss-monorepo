import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { draftProposal, parseDraft, starterDraft, pickTemplate, briefPrompt, SYSTEM } from "./ai.mjs";

test("byok.mjs is a byte-identical copy of the shared client", () => {
  const a = readFileSync(new URL("./byok.mjs", import.meta.url), "utf8");
  const b = readFileSync(new URL("../../platform/llm/byok.mjs", import.meta.url), "utf8");
  assert.equal(a, b, "run: cp platform/llm/byok.mjs ventures/proposal-maker/byok.mjs");
});

test("system prompt forbids drafting prices and legal terms", () => {
  assert.match(SYSTEM, /do not state prices/i);
});

test("parseDraft tolerates fences and trims to the schema", () => {
  const reply = 'Sure!\n```json\n{"summary":"Build a site.","problem":"Old site.","goals":["More leads","Fast"],"deliverables":[{"name":"Design","included":["Home page"],"excluded":["Logo"]},{"name":""}],"assumptions":"Client sends copy"}\n```';
  const d = parseDraft(reply);
  assert.equal(d.summary, "Build a site.");
  assert.equal(d.goals, "More leads\nFast");
  assert.equal(d.deliverables.length, 1);
  assert.equal(d.deliverables[0].excluded, "Logo");
  assert.equal(d.assumptions, "Client sends copy");
});

test("parseDraft rejects prose and empty drafts", () => {
  assert.throws(() => parseDraft("no json here"));
  assert.throws(() => parseDraft("{bad json}"));
  assert.throws(() => parseDraft('{"goals":["x"]}'));
});

test("template matching by keyword", () => {
  assert.equal(pickTemplate({ work: "Redesign their website and landing page" }).id, "web-design");
  assert.equal(pickTemplate({ work: "Monthly SEO and newsletter" }).id, "marketing-retainer");
  assert.equal(pickTemplate({ work: "Knit sweaters" }), null);
});

test("no key gives a starter from the brief, source fallback", async () => {
  const r = await draftProposal({}, { work: "Rebuild their website", client: "Acme Dental", situation: "Site is slow" });
  assert.equal(r.source, "fallback");
  assert.match(r.draft.summary, /Acme Dental/);
  assert.equal(r.draft.problem, "Site is slow");
  assert.ok(r.draft.deliverables.length >= 2);
});

test("empty brief is refused", async () => {
  await assert.rejects(() => draftProposal({}, { work: "  " }), /what work/i);
});

test("with a key the model draft is used; the prompt carries the brief and no key", async () => {
  let sent;
  const fetch = async (url, init) => {
    sent = { url, body: init.body, headers: init.headers };
    return { ok: true, json: async () => ({ content: [{ type: "text", text: '{"summary":"S","problem":"P","goals":["G"],"deliverables":[{"name":"D","included":["i"],"excluded":["e"]}],"assumptions":["A"]}' }], usage: { input_tokens: 1, output_tokens: 1 } }) };
  };
  const r = await draftProposal({ provider: "anthropic", apiKey: "sk-test" }, { work: "Audit", client: "Acme" }, { fetch });
  assert.equal(r.source, "model");
  assert.equal(r.draft.summary, "S");
  assert.match(sent.body, /Acme/);
  assert.doesNotMatch(sent.body, /sk-test/);
});

test("a failing provider falls back and says why", async () => {
  const fetch = async () => ({ ok: false, status: 401, json: async () => ({}) });
  const r = await draftProposal({ provider: "anthropic", apiKey: "bad" }, { work: "Audit website" }, { fetch });
  assert.equal(r.source, "fallback");
  assert.match(r.error, /401/);
  assert.ok(r.draft.summary);
});

test("briefPrompt skips empty fields", () => {
  assert.doesNotMatch(briefPrompt({ work: "x" }), /Client:/);
});
