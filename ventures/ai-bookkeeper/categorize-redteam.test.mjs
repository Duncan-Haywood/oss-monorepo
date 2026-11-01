// Guards for bugs the red-team campaign (2026-11-01) seeded in categorize.mjs that no test caught.
import test from "node:test";
import assert from "node:assert/strict";
import { payeeTokens, suggest, trainClassifier, historyRecord, BUILT_IN } from "./categorize.mjs";

test("two-letter payee words are kept, one-letter ones are dropped", () => {
  assert.deepEqual(payeeTokens("GE appliance"), ["ge", "appliance"]);
  assert.deepEqual(payeeTokens("a appliance"), ["appliance"]);
});

test("99 Ranch is matched as a grocery/meal keyword", () => {
  const hit = BUILT_IN.find(([a, d, re]) => a === "6130" && re.test("99 ranch market"));
  assert.ok(hit);
  assert.equal(suggest({ desc: "99 RANCH MARKET", cents: -2500 }, { rules: [], codes: null, classifier: { n: 0 } }).account, "6130");
});

test("a learned suggestion's confidence is capped at 0.85", () => {
  const hist = Array.from({ length: 30 }, () => historyRecord({ desc: "zorblax widgets", cents: -5000 }, "6120"));
  const model = { rules: [], codes: null, memory: new Map(), classifier: trainClassifier(hist) };
  const s = suggest({ desc: "zorblax widgets", cents: -5000 }, model);
  assert.equal(s.source, "learned");
  assert.ok(s.confidence <= 0.85, `confidence ${s.confidence}`);
});

test("the bank-category fallback needs a bankCat to be present", () => {
  const model = { rules: [], codes: null, classifier: { n: 0 } };
  const s = suggest({ desc: "QQQ UNKNOWNCO", cents: -500 }, model);
  assert.equal(s.source, "none");
  assert.equal(s.account, null);
});

test("7-Eleven is matched as a 6130 keyword", () => {
  assert.equal(suggest({ desc: "7-ELEVEN STORE", cents: -800 }, { rules: [], codes: null, classifier: { n: 0 } }).account, "6130");
});

test("skipping the bank-category layer ignores a present bankCat", () => {
  const model = { rules: [], codes: null, classifier: { n: 0 }, skip: new Set(["bank-category"]) };
  const s = suggest({ desc: "QQQ UNKNOWNCO", cents: -500, bankCat: "Food & Drink" }, model);
  assert.equal(s.source, "none");
  assert.equal(suggest({ desc: "QQQ UNKNOWNCO", cents: -500, bankCat: "Food & Drink" }, { ...model, skip: new Set() }).source, "bank-category");
});
