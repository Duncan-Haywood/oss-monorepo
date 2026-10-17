import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "./engine.mjs";

const NOW = Date.UTC(2026, 9, 16, 12);
const stack = (line = 10) => `TypeError: x\n    at render (https://a.com/app.3f9a1c2b.js:${line}:5)\n    at Object.run (/srv/app/node_modules/react/index.js:1:1)`;
const ev = (o = {}) => ({ type: "TypeError", message: 'Cannot read properties of undefined (reading "id")', stack: stack(), release: "1.0.0", ...o });

test("the same bug groups across different values, line numbers and bundle hashes", () => {
  const st = E.newState();
  const a = E.ingest(st, ev(), NOW), b = E.ingest(st, ev({ message: 'Cannot read properties of undefined (reading "name")', stack: stack(99).replace("3f9a1c2b", "aaaa1111") }), NOW);
  assert.ok(a.isNew && !b.isNew && a.issue === b.issue);
  assert.equal(a.issue.count, 2);
});

test("different functions are different groups", () => {
  const st = E.newState();
  E.ingest(st, ev(), NOW); const r = E.ingest(st, ev({ stack: stack().replace("render", "paint") }), NOW);
  assert.ok(r.isNew);
});

test("without a stack, messages group after ids and numbers are stripped", () => {
  const st = E.newState();
  const a = E.ingest(st, { message: "Order 1234 failed for user 55" }, NOW), b = E.ingest(st, { message: "Order 98 failed for user 7" }, NOW), c = E.ingest(st, { message: "Disk full" }, NOW);
  assert.ok(a.isNew && !b.isNew && c.isNew);
});

test("a custom fingerprint overrides the stack", () => {
  const st = E.newState();
  const a = E.ingest(st, ev({ fingerprint: ["db", "timeout"] }), NOW), b = E.ingest(st, ev({ stack: stack().replace("render", "other"), fingerprint: ["db", "timeout"] }), NOW);
  assert.equal(a.issue, b.issue);
});

test("Firefox-style frames parse", () => {
  const f = E.parseStack("render@https://a.com/app.js:10:5\n@https://a.com/app.js:3:1");
  assert.equal(f.length, 2); assert.equal(f[0].fn, "render"); assert.equal(f[1].fn, "<anonymous>");
});

test("a retried id is a duplicate and counts once", () => {
  const st = E.newState();
  E.ingest(st, ev({ id: "e1" }), NOW);
  assert.ok(E.ingest(st, ev({ id: "e1" }), NOW).duplicate);
  assert.equal(Object.values(st.issues)[0].count, 1);
});

test("events need a message or stack", () => {
  assert.throws(() => E.ingest(E.newState(), {}, NOW), /message or a stack/);
});

test("users are counted once and stored only as hashes", () => {
  const st = E.newState();
  for (const u of ["alice", "alice", "bob"]) E.ingest(st, ev({ user: u }), NOW);
  const i = Object.values(st.issues)[0];
  assert.equal(i.userCount, 2); assert.ok(!JSON.stringify(st).includes("alice"));
});

test("emails, tokens and sensitive query values are scrubbed before storage", () => {
  const st = E.newState();
  E.ingest(st, ev({ message: "bad login for ann@example.com Bearer abcdefghijklmnop1234", url: "https://a.com/cb?code=SECRET&page=2" }), NOW);
  const s = JSON.stringify(st);
  assert.ok(!s.includes("ann@example.com") && !s.includes("abcdefghijklmnop1234") && !s.includes("SECRET"));
  assert.ok(s.includes("page=2"));
});

test("resolved in a release: same release regresses, an older one does not, a newer one does", () => {
  for (const [rel, regress] of [["1.0.0", true], ["0.9.0", false], ["1.1.0", true], ["1.10.0", true]]) {
    const st = E.newState(); const id = E.ingest(st, ev({ release: "0.9.0" }), NOW).issue.id;
    E.resolve(st, id, "1.0.0");
    const r = E.ingest(st, ev({ release: rel }), NOW + 1000);
    assert.equal(r.regressed, regress, rel); assert.equal(st.issues[id].status, regress ? "unresolved" : "resolved");
  }
});

test("release compare is numeric, not alphabetical", () => {
  assert.ok(E.newerThan("1.10.0", "1.9.2")); assert.ok(!E.newerThan("1.9.2", "1.10.0")); assert.ok(E.newerThan("v2", "1.99"));
});

test("ignored issues stay ignored and out of the default list", () => {
  const st = E.newState(); const id = E.ingest(st, ev(), NOW).issue.id; E.ignore(st, id);
  E.ingest(st, ev(), NOW); assert.equal(st.issues[id].status, "ignored");
  assert.equal(E.list(st, { now: NOW }).length, 0); assert.equal(E.list(st, { status: "all", now: NOW }).length, 1);
});

test("spike needs volume and a jump over the issue's own baseline", () => {
  const st = E.newState(); const id = E.ingest(st, ev(), NOW - 30 * E.HOUR).issue.id, i = st.issues[id];
  for (let k = 1; k <= 24; k++) i.hours[Math.floor(NOW / E.HOUR) - k] = 2;      // steady 2 an hour
  i.hours[Math.floor(NOW / E.HOUR)] = 9; assert.equal(E.spike(i, NOW), null);   // under the floor
  i.hours[Math.floor(NOW / E.HOUR)] = 40; assert.ok(E.spike(i, NOW));
  for (let k = 1; k <= 24; k++) i.hours[Math.floor(NOW / E.HOUR) - k] = 50;     // a noisy issue is not spiking at 40
  assert.equal(E.spike(i, NOW), null);
});

test("the list puts spiking and busy issues first", () => {
  const st = E.newState();
  E.ingest(st, ev({ stack: stack().replace("render", "quiet") }), NOW);
  for (let k = 0; k < 5; k++) E.ingest(st, ev(), NOW);
  assert.equal(E.list(st, { now: NOW })[0].last24h, 5);
});

test("releases show which groups first appeared in each", () => {
  const st = E.newState();
  E.ingest(st, ev({ release: "1.0.0" }), NOW); E.ingest(st, ev({ release: "1.1.0", stack: stack().replace("render", "paint") }), NOW);
  const r = E.releases(st); assert.equal(r[0].release, "1.1.0"); assert.equal(r[0].newIssues, 1);
});

test("prune drops old buckets and dedupe ids", () => {
  const st = E.newState(); const i = E.ingest(st, ev({ id: "old" }), NOW).issue;
  E.prune(st, NOW + 20 * E.DAY); assert.deepEqual(i.hours, {}); assert.deepEqual(st.seen, {});
});

test("a future timestamp is distrusted and replaced by the server clock", () => {
  const st = E.newState(); const i = E.ingest(st, ev({ timestamp: new Date(NOW + 9 * E.DAY).toISOString() }), NOW).issue;
  assert.equal(i.lastSeen, NOW);
});
