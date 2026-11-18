import test from "node:test";
import assert from "node:assert/strict";
import { testPlan, testPlanCsv } from "./testing.mjs";

const ids = p => p.rows.map(r => r.id);

test("adult tee for the US with no special features: flammability and Prop 65 only", () => {
  const p = testPlan({ product: "adult-apparel", markets: ["us"], features: [] });
  assert.deepEqual(ids(p).sort(), ["us-flam", "us-prop65"]);
  assert.ok(!ids(p).includes("us-cpsia-lead"));
});

test("a child's tee with raised prints for the US and EU adds lead, certificate and phthalates", () => {
  const p = testPlan({ product: "child-apparel", markets: ["us", "eu"], features: ["plastisol"] });
  for (const id of ["us-cpsia-lead", "us-cpsia-cert", "us-phthalate", "eu-phthalate", "eu-gpsr", "eu-reach-azo"]) assert.ok(ids(p).includes(id), id);
  assert.ok(!ids(p).includes("us-sleepwear"));
  assert.ok(p.notes.some(n => /phthalate/.test(n)));
  assert.ok(p.notes.some(n => /CPSC-accepted/.test(n)));
});

test("shared REACH rows appear once and name every selected market they cover", () => {
  const p = testPlan({ product: "adult-apparel", markets: ["eu", "uk"], features: [] });
  const azo = p.rows.filter(r => r.id === "eu-reach-azo");
  assert.equal(azo.length, 1);
  assert.deepEqual(azo[0].markets, ["eu", "uk"]);
  assert.equal(p.byMarket.eu, p.rows.filter(r => r.markets.includes("eu")).length);
});

test("sunglasses: FDA impact in the US, CE category I test in the EU, none of the garment rules", () => {
  const p = testPlan({ product: "sunglasses", markets: ["us", "eu"], features: ["metal"] });
  for (const id of ["us-fda-impact", "eu-ppe", "eu-nickel", "us-fda-reg"]) assert.ok(ids(p).includes(id), id);
  assert.ok(!ids(p).includes("us-flam"));
  assert.ok(p.notes.some(n => /combined quote/.test(n)));
});

test("required rows come before check rows; the request text numbers every row", () => {
  const p = testPlan({ product: "child-sleepwear", markets: ["us", "uk"], features: ["cords"] });
  const levels = p.rows.map(r => r.level);
  assert.deepEqual(levels, [...levels].sort((a, b) => (a === "required" ? 0 : 1) - (b === "required" ? 0 : 1)));
  assert.equal(p.requestText.split("\n").length, p.rows.length + 1);
  assert.match(p.requestText, /^Please include these tests/);
});

test("CSV neutralises formula cells and quotes commas", () => {
  const p = testPlan({ product: "adult-apparel", markets: ["us"], features: [] });
  p.rows[0].title = "=SUM(1,2)";
  const csv = testPlanCsv(p);
  assert.match(csv, /^Test,Markets/);
  assert.match(csv, /"'=SUM\(1,2\)"/);
});

test("bad input throws a plain message", () => {
  assert.throws(() => testPlan({ product: "hat", markets: ["us"] }), /product must be one of/);
  assert.throws(() => testPlan({ product: "sunglasses", markets: [] }), /at least one market/);
  assert.throws(() => testPlan({ product: "sunglasses", markets: ["mars"] }), /market must be one of/);
  assert.throws(() => testPlan({ product: "sunglasses", markets: ["us"], features: ["glitter"] }), /feature must be one of/);
  assert.throws(() => testPlan(null), /Give the product/);
});

test("an adult tee with plastisol prints for the EU and UK gets the REACH entry 51 phthalate test (articles in general since 2020)", () => {
  const p = testPlan({ product: "adult-apparel", markets: ["eu", "uk"], features: ["plastisol"] });
  const row = p.rows.find(r => r.id === "eu-phthalate");
  assert.ok(row, "adult plasticised prints are restricted in the EU and GB, not only children's");
  assert.deepEqual(row.markets, ["eu", "uk"]);
  assert.match(row.rule, /2018\/2005/);
  assert.match(row.ask, /DIBP/);
  // the US federal phthalate rule is children's products only
  assert.ok(!ids(testPlan({ product: "adult-apparel", markets: ["us"], features: ["plastisol"] })).includes("us-phthalate"));
  // the children's ink note stays children's only
  assert.ok(!p.notes.some(n => /children's design fails a phthalate test/.test(n)));
});

test("each row says why it is there: the feature, or every garment / every pair", () => {
  const tee = testPlan({ product: "adult-apparel", markets: ["us"], features: ["finish"] });
  assert.equal(tee.rows.find(r => r.id === "us-flam").trigger, "every garment of this kind");
  assert.equal(tee.rows.find(r => r.id === "us-pfas").trigger, "your design has a water-, oil- or stain-repellent finish");
  const shades = testPlan({ product: "sunglasses", markets: ["us"], features: [] });
  assert.equal(shades.rows.find(r => r.id === "us-fda-impact").trigger, "every pair of this kind");
});
