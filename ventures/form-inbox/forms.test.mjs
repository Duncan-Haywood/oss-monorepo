import { test } from "node:test";
import assert from "node:assert/strict";
import { newState, normalize, score, createForm, addSubmission, markSpam, removeSubmission, removeForm, submissions, toCsv, fingerprint, LIMITS } from "./forms.mjs";

test("normalize drops control fields, caps sizes and joins arrays", () => {
  const d = normalize({ name: "Ann", _gotcha: "", _ts: "1", tags: ["a", "b"], ["x".repeat(200)]: "long key", __proto__x: 1, msg: "y".repeat(9000) });
  assert.equal(d.name, "Ann"); assert.equal(d.tags, "a, b");
  assert.ok(!("_gotcha" in d) && !("_ts" in d));
  assert.equal(d.msg.length, LIMITS.value);
  assert.ok(Object.keys(d).every((k) => k.length <= LIMITS.key));
});

test("a normal enquiry is not spam", () => {
  const v = score({ name: "Ann Lee", email: "ann@example.com", message: "Hi, do you ship to Canada? Thanks." }, { now: 10_000, loadedAt: 1000 });
  assert.equal(v.spam, false); assert.equal(v.score, 0);
});

test("honeypot is decisive", () => assert.equal(score({ a: "hello" }, { honeypot: "http://x" }).spam, true));
test("instant submissions are penalised", () => assert.ok(score({ a: "hello there" }, { now: 5000, loadedAt: 4500 }).score >= 40));
test("link floods and spam phrases add up", () => {
  const v = score({ message: "Best backlink and seo service! http://a.com http://b.com http://c.com http://d.com" });
  assert.equal(v.spam, true); assert.ok(v.reasons.some((r) => /links/.test(r)) && v.reasons.some((r) => /spam phrase/.test(r)));
});
test("duplicates of recent posts are caught", () => {
  const d = { message: "please call me about your offer" };
  assert.equal(score(d, { recent: [fingerprint(d)] }).spam, true);
});
test("fingerprint ignores key order", () => assert.equal(fingerprint({ a: "1", b: "2" }), fingerprint({ b: "2", a: "1" })));
test("disposable and malformed emails are flagged", () => {
  assert.ok(score({ email: "x@mailinator.com", m: "hello" }).reasons.some((r) => /disposable/.test(r)));
  assert.ok(score({ email: "nope", m: "hello" }).reasons.some((r) => /malformed/.test(r)));
});
test("empty submissions are spam", () => assert.equal(score({ a: "  " }).spam, true));

test("createForm validates origins, redirect and email", () => {
  const s = newState();
  const f = createForm(s, { name: "Contact", origins: "https://a.com/path https://b.com", redirect: "https://a.com/thanks", notifyEmail: "me@a.com" });
  assert.deepEqual(f.origins, ["https://a.com", "https://b.com"]);
  assert.throws(() => createForm(s, { name: "x", origins: "javascript:alert(1)" }), /bad origin/);
  assert.throws(() => createForm(s, { name: "x", redirect: "javascript:alert(1)" }), /redirect/);
  assert.throws(() => createForm(s, { name: "x", notifyEmail: "nope" }), /email/);
  assert.throws(() => createForm(s, { name: " " }), /name/);
});

test("counts stay right through spam toggles, deletes and the retention cap", () => {
  const s = newState(); const f = createForm(s, { name: "C" });
  const a = addSubmission(s, f.id, { m: "1" }, { score: 0, reasons: [], spam: false });
  addSubmission(s, f.id, { m: "2" }, { score: 90, reasons: ["x"], spam: true });
  assert.deepEqual([f.count, f.spam], [2, 1]);
  markSpam(s, a.id, true); assert.equal(f.spam, 2); markSpam(s, a.id, false); assert.equal(f.spam, 1);
  assert.ok(removeSubmission(s, a.id)); assert.deepEqual([f.count, f.spam], [1, 1]);
  assert.equal(submissions(s, f.id).length, 0); assert.equal(submissions(s, f.id, { spam: true }).length, 1);
  assert.ok(removeForm(s, f.id)); assert.equal(s.subs.length, 0);
  const g = createForm(s, { name: "G" });
  for (let i = 0; i < LIMITS.subs + 5; i++) addSubmission(s, g.id, { i: String(i) }, { score: 0, reasons: [], spam: false });
  assert.equal(s.subs.length, LIMITS.subs); assert.equal(g.count, LIMITS.subs);
});

test("CSV neutralises spreadsheet formulas and quotes properly", () => {
  const s = newState(); const f = createForm(s, { name: "C" });
  addSubmission(s, f.id, { name: "=HYPERLINK(\"http://evil\")", note: "a,b\nc" }, { score: 0, reasons: [], spam: false });
  const csv = toCsv(submissions(s, f.id));
  assert.match(csv, /'=HYPERLINK/); assert.match(csv, /"a,b\nc"/); assert.match(csv, /^received,name,note,spam_score\n/);
});
