import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "./engine.mjs";

const NOW = Date.UTC(2026, 9, 15, 12);
const acct = (signupAt, evs, convertedAt = null) => ({ signupAt, convertedAt, events: evs.map(([d, t = "login"]) => [signupAt + d * E.DAY, t]) });

test("features use only the first 7 days: later events cannot change them", () => {
  const a = acct(0, [[0.1], [1], [2, "invite"]]), b = acct(0, [[0.1], [1], [2, "invite"], [9], [20]]);
  assert.deepEqual(E.windowOf(a), E.windowOf(b));
  const w = E.windowOf(a);
  assert.equal(w.events, 3); assert.equal(w.types, 2); assert.equal(w.activeDays, 3);
});

test("a signup that paid inside week 1 is left out, not counted as a clean yes", () => {
  const accounts = { early: acct(0, [[1]], 3 * E.DAY), ok: acct(0, [[1]], 12 * E.DAY), no: acct(0, [[1]]), young: acct(NOW - 10 * E.DAY, [[1]]), late: acct(0, [[1]], 50 * E.DAY) };
  const { rows, skipped } = E.buildRows(accounts, NOW);
  assert.deepEqual(rows.map((r) => [r.id, r.y]).sort(), [["no", 0], ["ok", 1]]);
  assert.deepEqual(skipped, { paidEarly: 1, tooYoung: 1, paidLate: 1 });
});

test("auc and top capture are right on tiny known cases", () => {
  assert.equal(E.auc([0.9, 0.8, 0.2, 0.1], [1, 1, 0, 0]), 1);
  assert.equal(E.auc([0.1, 0.2, 0.8, 0.9], [1, 1, 0, 0]), 0);
  assert.equal(E.auc([0.5, 0.5], [1, 0]), 0.5);
  assert.equal(E.auc([0.5, 0.6], [1, 1]), null);
  assert.equal(E.topCapture([0.9, 0.1, 0.5, 0.2, 0.3], [1, 0, 1, 0, 0], 0.4), 1);
});

test("on engagement-driven synthetic signups the model finds a real signal out-of-time", () => {
  const t = E.train(E.syntheticAccounts(NOW), NOW);
  assert.equal(t.mode, "model");
  assert.ok(t.validation, t.note);
  assert.ok(t.validation.auc > 0.7, `auc ${t.validation.auc}`);
  assert.ok(t.validation.top20Capture > 0.3, `capture ${t.validation.top20Capture}`);
});

test("on pure noise it does not claim skill", () => {
  const rnd = E.mulberry32(3), accounts = {};
  for (let i = 0; i < 500; i++) {
    const s = NOW - (40 + Math.floor(rnd() * 120)) * E.DAY, n = Math.floor(rnd() * 12), evs = [];
    for (let k = 0; k < n; k++) evs.push([rnd() * 7, ["a", "b", "c"][Math.floor(rnd() * 3)]]);
    accounts[`n${i}`] = acct(s, evs, rnd() < 0.2 ? s + (8 + rnd() * 20) * E.DAY : null);
  }
  const t = E.train(accounts, NOW);
  assert.ok(t.validation && t.validation.auc < 0.62, `auc ${t.validation?.auc}`);
});

test("too little history gives a labelled heuristic, never a model", () => {
  const t = E.train({ a: acct(NOW - 60 * E.DAY, [[1]]), b: acct(NOW - 60 * E.DAY, [[1]], NOW - 40 * E.DAY) }, NOW);
  assert.equal(t.mode, "heuristic"); assert.equal(t.model, null); assert.match(t.note, /not a probability/);
});

test("scoring covers week-1-complete, unpaid, recent signups and explains each in words", () => {
  const accounts = E.syntheticAccounts(NOW), trained = E.train(accounts, NOW), rows = E.score(accounts, trained, NOW);
  assert.ok(rows.length > 10);
  for (const r of rows) { const a = accounts[r.id]; assert.equal(a.convertedAt, null); assert.ok(NOW - a.signupAt >= 7 * E.DAY && NOW - a.signupAt <= 45 * E.DAY); }
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].score >= rows[i].score);
  assert.ok(rows[0].reasons.length >= 1 && rows[0].reasons.every((s) => typeof s === "string"));
  assert.ok(rows[0].score > rows[rows.length - 1].score);
});

test("ingest is idempotent, validates, and sets signup from the earliest event", () => {
  const s = E.newState();
  assert.equal(E.ingest(s, { id: "e1", account: "a", timestamp: NOW - 2 * E.DAY }, NOW), "accepted");
  assert.equal(E.ingest(s, { id: "e1", account: "a", timestamp: NOW - 2 * E.DAY }, NOW), "duplicate");
  E.ingest(s, { id: "e2", account: "a", timestamp: NOW - 3 * E.DAY }, NOW);
  assert.equal(s.accounts.a.signupAt, NOW - 3 * E.DAY);
  assert.throws(() => E.ingest(s, { id: "e3", account: "a b" }, NOW), /account/);
  assert.throws(() => E.ingest(s, { id: "e4", account: "a", timestamp: NOW + 5 * E.DAY }, NOW), /future/);
});

test("parseCsv reads both lists and reports bad lines", () => {
  const { accounts, errors } = E.parseCsv("account,date,type\nann,2026-09-01,login\nann,2026-09-02,invite\nbad line\n", "ann,2026-09-12\nghost,2026-09-12");
  assert.equal(accounts.ann.events.length, 2); assert.equal(accounts.ann.convertedAt, Date.parse("2026-09-12"));
  assert.equal(errors.length, 2);
});
