import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ROLES, ESTIMATES, QUOTES, estimate, normaliseInputs, checkInputs, estimateToMarkdown } from "./cost.mjs";

const RULE = readFileSync(new URL("./fixtures/cost/89-fr-83092-cost.txt", import.meta.url), "utf8");
const FOLDED = RULE.replace(/\s+/g, " ");

test("every quote is word for word in the rule's text", () => {
  for (const [k, q] of Object.entries(QUOTES)) assert.ok(FOLDED.includes(q), `${k} not in the fixture`);
});

test("every rate is one the rule prints", () => {
  for (const [k, r] of Object.entries(ROLES)) assert.ok(FOLDED.includes(`$${r.rate.toFixed(2)}`), `${k} rate ${r.rate}`);
});

test("every line's hours appear in the rule's text for that role", () => {
  for (const sizes of Object.values(ESTIMATES)) for (const est of Object.values(sizes)) {
    for (const [, lines] of est.phases) for (const [role, h] of [...lines]) {
      const rate = ROLES[role].rate.toFixed(2);
      const re = new RegExp(`\\$${rate.replace(".", "\\.")}(/ ?hrs?)? ?[x*]\\*? ?${String(h).replace(".", "\\.")} ?hrs`);
      assert.match(FOLDED, re, `${role} ${h} h`);
    }
  }
});

// The rule rounds each line to the dollar and prints the totals; recomputing at DoD's rates must give
// them back, within the rule's own "minor rounding difference" (it rounds lines and totals separately).
for (const [size, levels] of Object.entries(ESTIMATES)) for (const [level, est] of Object.entries(levels)) {
  test(`${size} ${level}: DoD's rates give back the rule's stated totals`, () => {
    const e = estimate({ size, level });
    e.phases.forEach((p, i) => assert.ok(Math.abs(p.cost - est.stated.phases[i]) <= 2, `${p.label}: ${p.cost} vs ${est.stated.phases[i]}`));
    assert.ok(Math.abs(e.affirmation - est.stated.affirmation) <= 1, `affirmation ${e.affirmation}`);
    if (est.c3pao) assert.equal(e.c3pao.cost, est.stated.c3pao);
    assert.ok(Math.abs(e.assessment - est.stated.assessment) <= 2, `assessment ${e.assessment} vs ${est.stated.assessment}`);
    if (est.stated.threeYear) assert.ok(Math.abs(e.threeYear - est.stated.threeYear) <= 5, `three years ${e.threeYear} vs ${est.stated.threeYear}`);
    for (const n of [est.stated.assessment, est.stated.threeYear].filter(Boolean)) assert.ok(FOLDED.includes(`$${n.toLocaleString("en-US")}`), `${n} printed in the rule`);
  });
}

test("Level 1 repeats every year; Level 2 assesses once and affirms twice", () => {
  const l1 = estimate({ size: "small", level: "l1" });
  assert.deepEqual(l1.years.map((y) => y.lines[0][0]), Array(3).fill("Assessment and its affirmation"));
  assert.equal(l1.threeYear, 3 * l1.assessment);
  const l2 = estimate({ size: "small", level: "l2self" });
  assert.deepEqual(l2.years.map((y) => y.lines[0][0]), ["Assessment and its affirmation", "Annual affirmation", "Annual affirmation"]);
});

test("the shop's own rates, C3PAO quote and gap figures replace DoD's", () => {
  const e = estimate({ size: "small", level: "l2c3pao", rates: { esp: "150", director: "$80" }, c3paoQuote: "45,000", gapOneTime: "20000", gapYearly: "6000" });
  const esp = e.phases[1].rows.find((r) => r.role === "esp");
  assert.equal(esp.rate, 150);
  assert.equal(esp.cost, 150 * 128);
  assert.equal(e.c3pao.cost, 45000);
  assert.ok(e.c3pao.fromQuote);
  assert.ok(e.custom);
  assert.equal(e.years[0].total, e.assessment + 20000 + 6000);
  assert.equal(e.years[1].total, e.affirmation + 6000);
  assert.equal(e.threeYear, e.assessment + 2 * e.affirmation + 20000 + 18000);
  assert.equal(e.perMonth, Math.round(e.threeYear / 36));
});

test("bad input never breaks the estimate: blanks and nonsense fall back to DoD's figures", () => {
  const base = estimate({ size: "small", level: "l2self" });
  const e = estimate({ size: "small", level: "l2self", rates: { esp: "abc", director: "-5", constructor: "1" }, gapOneTime: "x" });
  assert.equal(e.assessment, base.assessment);
  assert.equal(e.gapOneTime, 0);
  const errs = checkInputs(normaliseInputs({ rates: { esp: "abc" }, gapYearly: "-1", level: "l2self", c3paoQuote: "5" }));
  assert.equal(errs.length, 3);
  assert.deepEqual(normaliseInputs({ size: "constructor", level: "__proto__" }).level, "l2c3pao");
  assert.equal(normaliseInputs(null).size, "small");
});

test("the Markdown record escapes table cells and says what is left out", () => {
  const md = estimateToMarkdown(estimate({ size: "small", level: "l2c3pao" }), "2026-11-27");
  assert.match(md, /\*\*Assessment with its affirmation: \$101,75[0-9]\*\*/);
  assert.match(md, /Not included: the cost to implement/);
  assert.match(md, /89 FR 83092/);
  assert.doesNotMatch(md, /\| [^|]*<[^|]*\|/);
});
