import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, validateInputs, parseLocations, parseOrders, comparePolicies, fcfsBatches, optimiseBatches, makeRouter, pickList, pickListCsv, exampleData } from "./calc.mjs";

const inp = { ...DEFAULTS };
const example = () => {
  const ex = exampleData(inp);
  return parseOrders(ex.orders, parseLocations(ex.locations).map, inp).orders;
};

test("defaults validate and bad numbers are named", () => {
  assert.deepEqual(validateInputs(inp), []);
  const errs = validateInputs({ ...inp, aisles: 0, cartOrders: 2.5 });
  assert.ok(errs.some((e) => e.startsWith("aisles")));
  assert.ok(errs.some((e) => e.startsWith("cartOrders")));
});

test("locations and orders parse, with quantities, aisle-bay codes, a header and unknown SKUs", () => {
  const { map, errors } = parseLocations("sku,aisle,bay\nA1, 2, 5\nB2\t3\t1\nC3, 4-7");
  assert.deepEqual(errors, []);
  assert.deepEqual(map.get("A1"), { aisle: 2, bay: 5 });
  assert.deepEqual(map.get("C3"), { aisle: 4, bay: 7 });
  const o = parseOrders("SO-1: a1 x3, B2\n9-9, ZZZ\n# comment\nC3*2", map, inp);
  assert.equal(o.orders.length, 3);
  assert.deepEqual(o.orders[0], { id: "SO-1", lines: [{ sku: "a1", qty: 3, aisle: 2, bay: 5 }, { sku: "B2", qty: 1, aisle: 3, bay: 1 }] });
  assert.deepEqual(o.orders[1].lines[0], { sku: "9-9", qty: 1, aisle: 9, bay: 9 });
  assert.equal(o.orders[2].lines[0].qty, 2);
  assert.ok(o.errors.some((e) => e.includes("ZZZ")));
  assert.ok(parseOrders("99-1", map, inp).errors[0].includes("outside the layout"));
});

test("every order lands in exactly one cart and no cart breaks the limits", () => {
  const orders = example();
  for (const lim of [{ cartOrders: 4, cartLines: 0 }, { cartOrders: 6, cartLines: 8 }, { cartOrders: 1, cartLines: 0 }]) {
    const p = { ...inp, ...lim };
    for (const batches of [fcfsBatches(orders, p), optimiseBatches(orders, p, makeRouter(p))]) {
      const ids = batches.flat().map((o) => o.id).sort();
      assert.deepEqual(ids, orders.map((o) => o.id).sort());
      for (const b of batches) {
        assert.ok(b.length >= 1 && b.length <= p.cartOrders);
        if (p.cartLines) assert.ok(b.reduce((s, o) => s + o.lines.length, 0) <= p.cartLines);
      }
    }
  }
});

test("on the example the options rank as expected and grouped carts beat arrival-order carts", () => {
  const { rows } = comparePolicies(example(), inp);
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.ok(by.single_optimal.feet <= by.single_largestgap.feet);
  assert.ok(by.single_optimal.feet <= by.single_sshape.feet);
  assert.ok(by.fcfs_optimal.feet <= by.fcfs_sshape.feet);
  assert.ok(by.smart_optimal.feet < by.fcfs_optimal.feet);
  assert.equal(by.single_sshape.savingPct, 0);
  // hours and dollars follow from feet
  const r = by.smart_optimal;
  assert.ok(Math.abs(r.hoursPerDay - r.feet / inp.walkFtPerMin / 60) < 1e-9);
  assert.ok(Math.abs(r.costPerYear - r.hoursPerDay * inp.daysPerYear * inp.wagePerHour) < 1e-6);
});

test("the figures quoted on the page match the example", () => {
  const { rows, baseline } = comparePolicies(example(), inp);
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(Math.round(baseline.feet / 100) * 100, 29200);
  assert.equal(Math.round(by.single_optimal.savingPct), 13);
  assert.equal(Math.round(by.fcfs_optimal.savingPct), 59);
  assert.equal(Math.round(by.smart_optimal.savingPct), 71);
  assert.equal(Math.round((baseline.hoursPerDay - by.smart_optimal.hoursPerDay) * 10) / 10, 1.7);
});

test("a pick list covers every line once, in route order, with totes", () => {
  const orders = example();
  const res = comparePolicies(orders, inp);
  for (const b of res.smart) {
    const pl = pickList(b, res.router);
    const picked = pl.stops.flatMap((s) => s.items.map((it) => `${it.order}|${it.sku}`)).sort();
    assert.deepEqual(picked, b.flatMap((o) => o.lines.map((l) => `${o.id}|${l.sku}`)).sort());
    assert.equal(pl.length, res.router.length(b.flatMap((o) => o.lines.map((l) => `${l.aisle}-${l.bay}`))));
  }
  const csv = pickListCsv(res.smart, res.router);
  assert.equal(csv.split("\n")[0], "cart,stop,aisle,bay,sku,qty,tote,order");
  assert.equal(csv.trim().split("\n").length - 1, orders.reduce((s, o) => s + o.lines.length, 0));
});

test("dead-end aisles drop the routes that need a back cross aisle", () => {
  const p = { ...inp, backAisle: 0 };
  const { rows } = comparePolicies(example(), p);
  assert.ok(rows.every((r) => !r.id.includes("sshape") && !r.id.includes("largestgap")));
  assert.ok(rows.every((r) => Number.isFinite(r.feet)));
});
