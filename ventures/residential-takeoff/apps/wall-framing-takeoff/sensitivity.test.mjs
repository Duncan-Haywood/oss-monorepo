import { test } from "node:test";
import assert from "node:assert/strict";
import { restack, sensitivity, sensitivityText } from "./sensitivity.mjs";
import { main } from "./cli.mjs";
import { samplePlan } from "./engine.mjs";

// Hand-made budget: Lumber 1000, Labor 500; tax 10% and contingency 5% on materials; overhead 10%, profit 10%.
// materials 1000, tax 100, contingency 55 => 1155; + labor 500 = cost 1655; overhead 165.5; profit (1655+165.5)*0.1 = 182.05; bid 2002.55.
const hand = {
  sections: [{ name: "Lumber", subtotal: 1000 }, { name: "Labor", subtotal: 500 }],
  taxRate: 0.1, contingencyRate: 0.05, overheadRate: 0.1, profitRate: 0.1, profit: 182.05, unpriced: [],
};

test("no shock reproduces the hand-stacked cost and bid", () => {
  assert.deepEqual(restack(hand), { total: 1655, bid: 2002.55 });
});

test("lumber +20%: materials 1200, tax 120, contingency 66, labor 500 = 1886; bid 1886 x 1.21", () => {
  const up = restack(hand, { Lumber: 1.2 });
  assert.equal(up.total, 1886);
  assert.equal(up.bid, 2282.06);
});

test("labor is outside tax and contingency; sensitivity ranks by swing and gives the profit break-even", () => {
  const s = sensitivity(hand, 10);
  assert.deepEqual(s.rows.map((r) => r.section), ["Lumber", "Labor"]);
  assert.equal(s.rows[1].costUp, 50); // labor +10% = 50, no tax
  // 115.5 cost per 10% => 11.55 per 1%; profit 182.05 / 11.55 = 15.76%
  assert.equal(s.rows[0].profitAbsorbsPct, 15.76);
  assert.ok(sensitivityText(s).join("\n").includes("15.76% rise"));
});

test("bad swings are refused", () => {
  assert.throws(() => sensitivity(hand, 0));
  assert.throws(() => sensitivity({}, 10));
});

test("CLI: 0-shock identity on a real priced plan, and a bad --swing exits 1", () => {
  const plan = { ...samplePlan(), prices: { tax: 0.07, contingency: 0.05, overhead: 0.1, profit: 0.1 } };
  const run = (...f) => main(["p.json", ...f], () => JSON.stringify(plan));
  const out = run("--sensitivity", "--json");
  assert.equal(out.code, 0);
  const s = JSON.parse(out.out);
  const bj = JSON.parse(run("--budget", "--json").out);
  // restack keeps full precision between stages while budget() rounds each stage to the cent, so a 0% shock agrees to a cent
  assert.ok(Math.abs(s.total - bj.total) <= 0.011, `${s.total} vs ${bj.total}`);
  assert.ok(Math.abs(s.bid - bj.bid) <= 0.011, `${s.bid} vs ${bj.bid}`);
  assert.equal(run("--sensitivity", "--swing=0").code, 1);
});

test("sensitivity refuses hostile budgets and swings with a reason", async () => {
  const { sensitivity } = await import("./sensitivity.mjs");
  const good = () => ({ sections: [{ name: "Lumber", subtotal: 1000 }, { name: "Labor", subtotal: 500 }], taxRate: 0.1, contingencyRate: 0.05, overheadRate: 0.1, profitRate: 0.1, profit: 100 });
  assert.equal(sensitivity(good(), 10).pct, 10);
  assert.throws(() => sensitivity(good(), "10"), /between 1 and 100/);
  for (const bad of [NaN, Infinity, "1000", -5, 1e12, null]) {
    const b = good(); b.sections[0].subtotal = bad;
    assert.throws(() => sensitivity(b), /subtotal/, String(bad));
  }
  const n = good(); n.sections = [null];
  assert.throws(() => sensitivity(n), /needs a name/);
  assert.throws(() => sensitivity({ ...good(), taxRate: "0.1" }), /taxRate/);
  assert.throws(() => sensitivity({ ...good(), profit: NaN }), /profit/);
});

test("restack refuses input that is not a budget with a reason; a bad factors value reads as no shock", () => {
  for (const bad of [null, undefined, 5, "x", {}, []]) assert.throws(() => restack(bad), /needs a budget result/);
  for (const f of [null, 5, "x"]) assert.deepEqual(restack(hand, f), { total: 1655, bid: 2002.55 });
});
