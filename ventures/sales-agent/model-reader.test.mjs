// eval/model-reader.mjs: a reader from another model family for the Enron stops (eval/README.md).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { readerBrief, parseLabel, userPrompt, ask, kappa, compare, LABELS } from "./eval/model-reader.mjs";

test("the brief is READER.md without its batch-file Output section, asking for one label", () => {
  const md = fs.readFileSync(new URL("./eval/enron-labels/READER.md", import.meta.url), "utf8");
  const b = readerBrief(md);
  assert.match(b, /Judge the whole reply/);
  assert.match(b, /Rules of thumb/);
  assert.doesNotMatch(b, /"rows"/);
  for (const l of LABELS) assert.ok(b.includes(l));
});

test("parseLabel takes the first label named, in any spelling the model uses", () => {
  assert.equal(parseLabel("not_interested"), "not_interested");
  assert.equal(parseLabel("Not interested."), "not_interested");
  assert.equal(parseLabel("`out-of-office`"), "out_of_office");
  assert.equal(parseLabel("Label: left_company"), "left_company");
  assert.equal(parseLabel("none"), "none");
  assert.equal(parseLabel("unsubscribe, not none"), "unsubscribe");
  assert.equal(parseLabel("I cannot tell"), null);
});

test("the reply is cut so a long thread fits the context", () => {
  assert.ok(userPrompt("x".repeat(9000)).length < 4100);
});

test("ask sends temperature 0 and the brief as the system message", async () => {
  let sent;
  const fetchImpl = async (url, init) => { sent = { url, body: JSON.parse(init.body) }; return { ok: true, json: async () => ({ choices: [{ message: { content: "none" } }] }) }; };
  const out = await ask({ baseUrl: "http://localhost:8080/v1/", model: "m", system: "S", prompt: "P", fetchImpl });
  assert.equal(out, "none");
  assert.equal(sent.url, "http://localhost:8080/v1/chat/completions");
  assert.equal(sent.body.temperature, 0);
  assert.deepEqual(sent.body.messages.map((m) => m.role), ["system", "user"]);
});

test("kappa: 1 for identical, 0 when agreement is only chance", () => {
  assert.equal(kappa(["a", "b", "a"], ["a", "b", "a"]), 1);
  assert.equal(kappa(["a", "a", "b", "b"], ["a", "b", "a", "b"]), 0);
});

test("compare counts exact and stop-or-not agreement on shared ids only", () => {
  const A = { rows: [{ id: 1, reader: "none" }, { id: 2, reader: "unsubscribe" }, { id: 3, reader: "out_of_office" }, { id: 9, reader: "none" }] };
  const B = { rows: [{ id: 1, reader: "none" }, { id: 2, reader: "not_interested" }, { id: 3, reader: "none" }] };
  const r = compare([A, B]);
  assert.equal(r.n, 3);
  assert.equal(r.pairs[0].same, 1);
  assert.equal(r.pairs[0].stopSame, 2);
  assert.deepEqual(r.pairs[0].disagreements.map((d) => d[1]), [1, 1]);
});
