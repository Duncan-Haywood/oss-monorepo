import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseRequests, plan, quotePrice, summarize, economics, money } from "./engine.mjs";

const fixture = readFileSync(new URL("./fixtures/requests.csv", import.meta.url), "utf8");

test("parses rows, header and comments; reports bad rows by line", () => {
  const p = parseRequests("dog,size,minutes,price,supplies\n# c\nBiscuit,Medium,75,$70,6,Doodle, curly\n\nTank,giant,120,120,12");
  assert.equal(p.errors.length, 0);
  assert.equal(p.requests.length, 2);
  assert.equal(p.requests[0].size, "medium");
  assert.equal(p.requests[0].note, "Doodle,curly");
  const bad = parseRequests("A,tiny,30,40,2\nB,small,0,40,2\nC,small,30,x,2\n,small,30,40,2");
  assert.equal(bad.errors.length, 4);
  assert.match(bad.errors[0], /line 1: size must be/);
  assert.match(bad.errors[1], /groom minutes must be a number above zero/);
});

test("economics: table time includes turnover, price for target is exact", () => {
  const o = { turnover: 10, targetHourly: 45 };
  const e = economics({ minutes: 50, price: 70, supplies: 10 }, o);
  assert.equal(e.block, 60);
  assert.equal(e.net, 60);
  assert.equal(e.netPerHour, 60);
  assert.equal(e.priceForTarget, 55);
  assert.equal(e.raiseBy, 0);
});

test("quotePrice hits the target per table hour and rounds up", () => {
  const q = quotePrice({ minutes: 80, supplies: 6, turnover: 10, targetHourly: 45 });
  assert.equal(q.exact, 73.5);
  assert.equal(q.price, 74);
  assert.ok(q.netPerHour >= 45);
  assert.equal(quotePrice({ minutes: 80, supplies: 6, targetHourly: 45, roundTo: 5 }).price, 75);
  assert.throws(() => quotePrice({ minutes: 0 }), /minutes/);
});

test("the worked example books six dogs and beats arrival order", () => {
  const p = plan(parseRequests(fixture), { capacity: 480, turnover: 10, targetHourly: 45, maxLarge: 2, noShow: 10 });
  assert.equal(p.totals.plan, 424);
  assert.equal(p.chosen.length, 6);
  assert.equal(p.totals.firstCome, 381);
  assert.equal(p.totals.upliftVsFirstCome, 43);
  assert.equal(p.totals.usedMinutes, 475);
  assert.equal(summarize(p).status, "gain");
  assert.ok(p.skipped.find((s) => s.name === "Rocco").reason.includes("$59.00"));
});

// Brute force over every subset must agree with the branch-and-bound.
function brute(requests, o) {
  let best = -Infinity;
  const n = requests.length;
  for (let mask = 0; mask < 1 << n; mask += 1) {
    let min = 0, net = 0, dogs = 0, large = 0;
    for (let i = 0; i < n; i += 1) {
      if (!(mask & (1 << i))) continue;
      const r = requests[i];
      min += r.minutes + o.turnover; net += r.price - r.supplies; dogs += 1;
      if (r.size === "large" || r.size === "giant") large += 1;
    }
    if (min > o.capacity || (o.maxDogs && dogs > o.maxDogs) || (o.maxLarge && large > o.maxLarge)) continue;
    if (net > best) best = net;
  }
  return best;
}

test("optimiser equals brute force on 300 random days", () => {
  let seed = 42;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const sizes = ["small", "medium", "large", "giant"];
  for (let t = 0; t < 300; t += 1) {
    const n = 3 + Math.floor(rnd() * 8);
    const requests = Array.from({ length: n }, (_, i) => ({
      id: i, name: `d${i}`, size: sizes[Math.floor(rnd() * 4)], minutes: 20 + Math.floor(rnd() * 140),
      price: Math.floor(20 + rnd() * 160), supplies: Math.floor(rnd() * 20), note: "",
    }));
    const o = { capacity: 240 + Math.floor(rnd() * 300), turnover: Math.floor(rnd() * 20), maxDogs: rnd() < 0.4 ? 2 + Math.floor(rnd() * 5) : 0, maxLarge: rnd() < 0.4 ? 1 + Math.floor(rnd() * 3) : 0 };
    const p = plan({ requests }, o);
    assert.ok(Math.abs(p.totals.plan - brute(requests, p.options)) < 1e-6, `trial ${t}`);
  }
});

test("limits, no-win days and bad options", () => {
  const rows = parseRequests("A,small,30,40,2\nB,small,30,40,2\nC,small,30,40,2");
  assert.equal(plan(rows, { maxDogs: 2 }).chosen.length, 2);
  const lose = plan(parseRequests("A,small,30,10,12"), {});
  assert.equal(lose.chosen.length, 0);
  assert.equal(summarize(lose).status, "none");
  assert.match(lose.skipped[0].reason, /does not cover/);
  assert.throws(() => plan(rows, { capacity: -5 }), /capacity/);
  assert.throws(() => plan(rows, { noShow: 150 }), /noShow/);
  assert.equal(money(-3.5), "-$3.50");
});

test("a request longer than the day is skipped with its reason", () => {
  const p = plan(parseRequests("Huge,giant,600,300,10\nOk,small,30,50,2"), { capacity: 480 });
  assert.equal(p.chosen.length, 1);
  assert.match(p.skipped[0].reason, /needs 610 table minutes/);
});
