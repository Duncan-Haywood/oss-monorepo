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

test("NTE 5680 (a robotics part number) is a 6100 keyword", () => {
  assert.equal(suggest({ desc: "NTE 5680 RELAY", cents: -1200 }, { rules: [], codes: null, classifier: { n: 0 } }).account, "6100");
});

test("payee memory returns the most frequent account, not the runner-up", () => {
  const memory = new Map([["acme store|out", new Map([["6120", 1], ["6130", 4]])]]);
  const s = suggest({ desc: "ACME STORE", cents: -900 }, { rules: [], codes: null, memory, classifier: { n: 0 } });
  assert.equal(s.source, "memory");
  assert.equal(s.account, "6130");
  assert.ok(Math.abs(s.confidence - 4 / 5.5) < 1e-9);
});

test("Form 2290 (heavy highway use tax) is a 6110 keyword, only that exact form number", () => {
  const re = BUILT_IN.find(([a, , r]) => a === "6110" && r.test("irs form 2290"))?.[2];
  assert.ok(re);
  assert.ok(!re.test("form 2291"));
});

test("Food 4 Less is matched as a grocery/meal keyword, Food 5 Less is not", () => {
  const hit = (s) => BUILT_IN.find(([a, d, re]) => a === "6130" && d === "out" && re.test(s));
  assert.ok(hit("food 4 less #12"));
  assert.ok(!hit("food 5 less #12"));
});

test("trainClassifier counts each confirmed line once per account", () => {
  const hist = Array.from({ length: 3 }, () => historyRecord({ desc: "zorblax widgets", cents: -5000 }, "6120"));
  const m = trainClassifier(hist);
  assert.equal(m.classes.get("6120").n, 3);
  assert.equal(m.n, 3);
});

test("an unresolved line lists up to three learned alternatives, best first", () => {
  const hist = ["6120", "6130", "6140", "6150"].flatMap((a) => Array.from({ length: 2 }, () => historyRecord({ desc: "zorblax widgets", cents: -5000 }, a)));
  const model = { rules: [], codes: null, memory: new Map(), classifier: trainClassifier(hist) };
  const s = suggest({ desc: "zorblax widgets", cents: -5000 }, model);
  assert.equal(s.source, "none");
  assert.equal(s.alternatives.length, 3);
});
