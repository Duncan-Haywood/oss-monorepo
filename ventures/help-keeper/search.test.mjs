import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIndex, search, tokens, stem, distance, snippet, related } from "./search.mjs";

const docs = [
  { id: "pw", title: "How to reset your password", headings: ["Forgot password"], tags: ["login"], body: "Click the reset link on the login page. We email you a link that expires in one hour." },
  { id: "bill", title: "Invoices and billing", headings: ["Download an invoice"], tags: [], body: "Download invoices from Settings. Billing happens monthly on the day you signed up." },
  { id: "export", title: "Export your data", headings: [], tags: ["csv", "backup"], body: "Export a CSV of everything from Settings, then Data. Large exports are emailed." },
  { id: "api", title: "API keys", headings: [], tags: [], body: "Create an API key in Settings. Keys can be revoked at any time." },
];
const ix = buildIndex(docs);
const top = (q) => search(ix, q).map((r) => r.id);

test("title and heading matches outrank body mentions", () => {
  assert.equal(top("password")[0], "pw"); assert.equal(top("invoice")[0], "bill"); assert.equal(top("csv")[0], "export");
  assert.equal(top("settings").length, 3, "a body-only word still finds every article that has it");
});

test("typos, transpositions and half-typed words still find the article", () => {
  assert.equal(top("pasword reset")[0], "pw"); assert.equal(top("pssword")[0], "pw"); assert.equal(top("invoce")[0], "bill");
  assert.equal(top("expor")[0], "export"); assert.equal(top("billin")[0], "bill");
  assert.deepEqual(top("zebra"), [], "unknown words find nothing rather than something random");
  assert.deepEqual(top("xq"), []);
});

test("matching every word beats matching one", () => {
  const r = search(ix, "export billing"); assert.equal(r.length, 2);
  const r2 = search(ix, "reset password link"); assert.equal(r2[0].id, "pw"); assert.ok(r2[0].matchedAll);
});

test("stop words and empty queries are harmless", () => {
  assert.deepEqual(top(""), []); assert.deepEqual(top("the of and"), []); assert.equal(top("how do I reset my password")[0], "pw");
  assert.deepEqual(search(buildIndex([]), "anything"), []);
});

test("stemming and edit distance behave", () => {
  assert.deepEqual(tokens("Invoices, exporting & Résumé!"), ["invoic", "export", "resume"]);
  assert.equal(stem("passes"), "pass"); assert.equal(stem("class"), "class"); assert.equal(stem("cats"), "cat");
  assert.equal(distance("password", "pasword", 2), 1); assert.equal(distance("abcd", "abdc", 2), 1); assert.equal(distance("abc", "xyz", 1), 2);
});

test("excerpts mark the matching words as separate segments, never as markup", () => {
  const segs = snippet("Some intro text. Click the reset link on the <login> page. More text follows here.", "reset link");
  assert.ok(segs.some((s) => s.hit && s.text === "reset")); assert.ok(segs.every((s) => typeof s.text === "string"));
  assert.ok(segs.map((s) => s.text).join("").includes("<login>"), "text is passed through untouched for the caller to escape");
  assert.deepEqual(snippet("", "x"), []);
});

test("related articles share vocabulary", () => {
  assert.ok(["export", "api"].includes(related(ix, "bill")[0]), "both of these mention Settings, as does Invoices");
  assert.ok(!related(ix, "bill").includes("bill"));
});
