import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTime, formatTime, parseProducts, parseOrders, schedule, orderEconomics, whatFixesIt, dropToFit, dayTotals, EXAMPLE_PRODUCTS, EXAMPLE_ORDERS, num, money } from "./calc.mjs";

const prods = () => parseProducts(EXAMPLE_PRODUCTS).products;
const ords = (products = prods()) => parseOrders(EXAMPLE_ORDERS, products).orders;

test("parseTime accepts 12h and 24h forms and rejects junk", () => {
  assert.equal(parseTime("7:30am"), 450);
  assert.equal(parseTime("6pm"), 1080);
  assert.equal(parseTime("12am"), 0);
  assert.equal(parseTime("12:15 PM"), 735);
  assert.equal(parseTime("18:30"), 1110);
  assert.ok(Number.isNaN(parseTime("25:00")));
  assert.ok(Number.isNaN(parseTime("7:75")));
  assert.ok(Number.isNaN(parseTime("13pm")));
  assert.ok(Number.isNaN(parseTime("soon")));
});

test("formatTime wraps into the day before and after", () => {
  assert.equal(formatTime(450), "7:30 AM");
  assert.equal(formatTime(0), "12:00 AM");
  assert.equal(formatTime(-60), "11:00 PM (day before)");
  assert.equal(formatTime(1500), "1:00 AM (+1d)");
});

test("num and money tolerate symbols", () => {
  assert.equal(num("$1,200"), 1200);
  assert.equal(money(-5.4), "-$5");
});

test("parsers skip comments and report bad lines by number", () => {
  const { products, errors } = parseProducts("# c\nBun, 10, 20, 30, 15, 2, 0.5\nBad, 0, 1, 1, 1\nBun, 5, 1, 1, 1");
  assert.equal(products.length, 1);
  assert.equal(errors.length, 2);
  assert.match(errors[0], /Product line 2/);
  assert.match(errors[1], /listed twice/);
  const o = parseOrders("A, bun, 5, 7am\nB, nope, 5, 7am\nC, bun, 0, 7am\nD, bun, 5, whenever", products);
  assert.equal(o.orders.length, 1);
  assert.equal(o.errors.length, 3);
});

test("a single batch is placed backwards from its due time", () => {
  const products = parseProducts("Bun, 10, 20, 30, 15").products;
  const { orders } = parseOrders("A, Bun, 10, 8:00am", products);
  const s = schedule(products, orders, { ovens: 1, bakers: 1, open: 0, cool: 20 });
  const b = s.batches[0];
  assert.equal(b.bakeEnd, 8 * 60 - 20);
  assert.equal(b.bakeStart, 8 * 60 - 20 - 15);
  assert.equal(b.proofStart, b.bakeStart - 30);
  assert.equal(b.prepStart, b.proofStart - 20);
  assert.equal(s.earliest, b.prepStart);
  assert.ok(s.feasible);
});

test("quantity splits into whole batches", () => {
  const products = parseProducts("Bun, 10, 5, 5, 10").products;
  const { orders } = parseOrders("A, Bun, 25, 9am", products);
  const s = schedule(products, orders, { ovens: 3, bakers: 3, open: 0 });
  assert.equal(s.batches.length, 3);
  assert.equal(orderEconomics(orders[0]).leftover, 5);
});

test("one oven never bakes two batches at once; two ovens can", () => {
  const products = parseProducts("Bun, 10, 0, 0, 30").products;
  const { orders } = parseOrders("A, Bun, 20, 9am", products);
  const one = schedule(products, orders, { ovens: 1, bakers: 1, open: 0, cool: 0 });
  const [x, y] = [...one.batches].sort((p, q) => p.bakeStart - q.bakeStart);
  assert.ok(y.bakeStart >= x.bakeEnd);
  const two = schedule(products, orders, { ovens: 2, bakers: 1, open: 0, cool: 0 });
  assert.equal(two.batches[0].bakeStart, two.batches[1].bakeStart);
  assert.ok(two.earliest > one.earliest);
});

test("bakers are a real limit on prep", () => {
  const products = parseProducts("Bun, 10, 60, 0, 10").products;
  const { orders } = parseOrders("A, Bun, 20, 9am", products);
  const one = schedule(products, orders, { ovens: 2, bakers: 1, open: 0, cool: 0 });
  const two = schedule(products, orders, { ovens: 2, bakers: 2, open: 0, cool: 0 });
  assert.equal(one.earliest, two.earliest - 60);
});

test("no two jobs ever exceed capacity (random orders)", () => {
  const products = prods();
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let t = 0; t < 40; t++) {
    const lines = Array.from({ length: 6 }, (_, i) => `O${i}, ${products[Math.floor(rnd() * products.length)].name}, ${1 + Math.floor(rnd() * 60)}, ${5 + Math.floor(rnd() * 5)}:${rnd() < 0.5 ? "00" : "30"}am`).join("\n");
    const { orders } = parseOrders(lines, products);
    const ovens = 1 + Math.floor(rnd() * 3), bakers = 1 + Math.floor(rnd() * 3);
    const s = schedule(products, orders, { ovens, bakers, open: 0 });
    const events = (a, b) => s.batches.flatMap((x) => [x[a], x[b]]);
    for (const [a, b, cap] of [["bakeStart", "bakeEnd", ovens], ["prepStart", "prepEnd", bakers]]) {
      for (const t0 of events(a, b)) {
        const live = s.batches.filter((x) => x[a] <= t0 && t0 < x[b]).length;
        assert.ok(live <= cap, `${live} > ${cap}`);
      }
    }
    for (const b of s.batches) {
      assert.ok(b.bakeEnd <= b.due - s.cool);
      assert.ok(b.prepEnd + b.product.proof <= b.bakeStart);
    }
  }
});

test("the example plan does not fit one oven and one baker, and does fit with enough", () => {
  const products = prods(), orders = ords(products);
  assert.equal(schedule(products, orders, { ovens: 1, bakers: 1, open: 60 }).feasible, false);
  assert.equal(schedule(products, orders, { ovens: 2, bakers: 3, open: 60 }).feasible, true);
});

test("shortBy says how many minutes before opening the plan has to start", () => {
  const products = prods(), orders = ords(products);
  const s = schedule(products, orders, { ovens: 1, bakers: 1, open: 60 });
  assert.equal(s.shortBy, 60 - s.earliest);
});

test("whatFixesIt returns the cheapest fitting addition", () => {
  const products = prods(), orders = ords(products);
  const fix = whatFixesIt(products, orders, { ovens: 1, bakers: 1, open: 60 });
  assert.ok(fix);
  assert.ok(schedule(products, orders, { ovens: fix.ovens, bakers: fix.bakers, open: 60 }).feasible);
  const already = whatFixesIt(products, orders, { ovens: 2, bakers: 3, open: 60 });
  assert.equal(already.extra, 0);
  assert.equal(whatFixesIt(products, orders, { ovens: 1, bakers: 1, open: 60 }, 1), null);
});

test("dropToFit keeps a feasible plan and drops the lowest profit per oven hour first", () => {
  const products = prods(), orders = ords(products);
  const r = dropToFit(products, orders, { ovens: 1, bakers: 2, open: 180 });
  assert.equal(r.plan.feasible, true);
  assert.ok(r.dropped.length > 0);
  assert.equal(r.kept.length + r.dropped.length, orders.length);
  const best = (list) => Math.max(...list.map((o) => orderEconomics(o).profitPerOvenHour));
  assert.ok(best(r.kept) >= best(r.dropped));
});

test("dropToFit drops nothing when everything fits", () => {
  const products = prods(), orders = ords(products);
  const r = dropToFit(products, orders, { ovens: 4, bakers: 6, open: 0 });
  assert.equal(r.dropped.length, 0);
});

test("orderEconomics counts leftover batch cost against profit", () => {
  const products = parseProducts("Bun, 10, 5, 5, 20, 3.00, 1.00").products;
  const { orders } = parseOrders("A, Bun, 15, 9am", products);
  const e = orderEconomics(orders[0]);
  assert.equal(e.batches, 2);
  assert.equal(e.made, 20);
  assert.equal(e.revenue, 45);
  assert.equal(e.cost, 20);
  assert.equal(e.profit, 25);
  assert.equal(e.ovenMinutes, 40);
});

test("dayTotals sums by product", () => {
  const t = dayTotals(ords());
  assert.equal(t.find((x) => x.name === "Croissant").ordered, 72);
});

test("empty input is a harmless empty plan", () => {
  const s = schedule([], [], {});
  assert.equal(s.batches.length, 0);
  assert.equal(s.feasible, true);
  assert.equal(s.earliest, null);
});
