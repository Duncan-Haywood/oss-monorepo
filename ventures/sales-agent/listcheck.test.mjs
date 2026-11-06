import test from "node:test";
import assert from "node:assert/strict";
import { checkList, extractAddress, toCsv } from "./listcheck.mjs";

test("clean work addresses are send", () => {
  const r = checkList("dana.ruiz@acme-example.com\nlee@widgets-example.co.uk");
  assert.deepEqual([r.send, r.review, r.drop], [2, 0, 0]);
});
test("invalid syntax is dropped", () => {
  const r = checkList("not-an-email\na@b\n.dot@x.com\ntwo..dots@x.com\nok@x.com");
  assert.equal(r.drop, 4);
  assert.equal(r.send, 1);
});
test("typo domain is review with a suggestion", () => {
  const r = checkList("sam@gmial.com");
  assert.equal(r.rows[0].verdict, "review");
  assert.match(r.rows[0].reasons.join(" "), /sam@gmail\.com/);
});
test("disposable domain is dropped; role account and free domain are review", () => {
  const r = checkList("x@mailinator.com\ninfo@acme-example.com\njo@gmail.com");
  assert.deepEqual(r.rows.map((x) => x.verdict), ["drop", "review", "review"]);
});
test("duplicates fold case and +tag; the first stays", () => {
  const r = checkList("Dana@x-example.com\ndana+sales@x-example.com\nDANA@X-EXAMPLE.COM");
  assert.deepEqual(r.rows.map((x) => x.verdict), ["send", "drop", "drop"]);
  assert.match(r.rows[1].reasons[0], /line 1/);
});
test("suppression list drops addresses and whole domains", () => {
  const r = checkList("a@gone-example.com\nb@blocked-example.org\nc@fine-example.com", { suppression: "a@gone-example.com\n@blocked-example.org" });
  assert.deepEqual(r.rows.map((x) => x.verdict), ["drop", "drop", "send"]);
});
test("CSV with header finds the email column and reports file line numbers", () => {
  const r = checkList("name,Email,company\nDana,dana@x-example.com,Acme\nBad,nope,Co");
  assert.equal(r.total, 2);
  assert.equal(r.rows[1].line, 3);
  assert.equal(r.rows[1].verdict, "drop");
});
test("Name <addr> form and mailto are read", () => {
  assert.equal(extractAddress("Dana Ruiz <Dana@X.com>"), "Dana@X.com");
  assert.equal(extractAddress("mailto:a@x.com"), "a@x.com");
  assert.equal(checkList("Dana Ruiz <dana@x-example.com>").send, 1);
});
test("toCsv keeps send rows, optionally review rows, never drops", () => {
  const r = checkList("a@x-example.com\ninfo@x-example.com\nbad");
  assert.equal(toCsv(r), "email\na@x-example.com\n");
  assert.equal(toCsv(r, true), "email\na@x-example.com\ninfo@x-example.com\n");
});
test("empty input is an empty result", () => {
  assert.equal(checkList("").total, 0);
});
