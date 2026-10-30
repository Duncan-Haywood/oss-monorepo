// Property test for the categorizer: seeded random descriptions (made up, no outside data).
// Invariants: payee tokens ignore case and spacing, hold no digits, and re-tokenising them
// changes nothing; suggest never throws, is deterministic, keeps confidence in [0, 1], never
// names an account outside the chart (transfer aside), and says "none" only with no account;
// classifier probabilities sum to 1.
import test from "node:test";
import assert from "node:assert/strict";
import { payeeTokens, payeeKey, trainClassifier, buildMemory, classify, suggest, historyRecord } from "./categorize.mjs";

const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const WORDS = ["blue", "bottle", "SQ", "*", "#0412", "oakland", "CA", "netflix", "shell", "oil", "POS", "debit", "x1y2", "Amazon", "mktp", "ACH", "payroll", "gusto", "rent", "o'brien", "café", "uber", "trip", "1234", "-", "/", "xxxx"];

test("categorizer holds its invariants on random descriptions", () => {
  const r = rng(20261030), pick = (a) => a[Math.floor(r() * a.length)];
  const desc = () => Array.from({ length: 1 + Math.floor(r() * 6) }, () => pick(WORDS)).join(r() < 0.5 ? " " : "  ");
  const codes = new Set(["6060", "6100", "4000", "5000"]);
  const history = Array.from({ length: 60 }, () => historyRecord({ desc: desc(), cents: Math.round((r() - 0.5) * 2e5) }, pick([...codes])));
  const model = { memory: buildMemory(history), classifier: trainClassifier(history), codes };
  for (let i = 0; i < 1500; i++) {
    const d = desc(), tag = JSON.stringify(d);
    const t = payeeTokens(d);
    assert.deepEqual(payeeTokens(d.toUpperCase()), payeeTokens(d.toLowerCase()), tag);
    assert.ok(t.every((x) => !/\d/.test(x) && x.length >= 2), tag);
    assert.deepEqual(payeeTokens(t.join(" ")), t, tag);
    assert.equal(payeeKey(d), t.slice(0, 2).join(" "), tag);
    const txn = { desc: d, cents: Math.round((r() - 0.5) * 4e5) };
    const s = suggest(txn, model);
    assert.deepEqual(suggest(txn, model), s, tag);
    assert.ok(s.confidence >= 0 && s.confidence <= 1, tag);
    assert.equal(s.source === "none", s.account === null, tag);
    if (s.account) assert.ok(codes.has(s.account) || s.account === "transfer", `${tag} -> ${s.account}`);
    const c = classify(model.classifier, txn);
    if (c.length) assert.ok(Math.abs(c.reduce((a, x) => a + x.p, 0) - 1) < 1e-9, tag);
  }
});

test("suggest survives hostile input", () => {
  const model = { memory: new Map(), classifier: trainClassifier([]), codes: new Set(["6060"]) };
  for (const desc of [undefined, null, "", "   ", "\u0000￿", "a".repeat(100000), 42, {}]) {
    const s = suggest({ desc, cents: 0 }, model);
    assert.equal(s.account, null);
  }
});
