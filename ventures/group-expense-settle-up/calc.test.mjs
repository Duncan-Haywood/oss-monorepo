import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allocate, parseAmount, parsePeople, parseLines, parseRates, ledger, settleGreedy, settleFewest, settleDirect,
  zeroSumGroups, run, EXAMPLE, encodeState, decodeState, expensesCsv, transfersCsv, transfersText, paymentLine,
  formatMinor, EXACT_LIMIT,
} from "./calc.mjs";

// Apply transfers to balances; every settlement must leave everyone at zero.
function applied(net, transfers) {
  const b = net.slice();
  for (const t of transfers) {
    assert.ok(t.cents > 0, "a transfer moves money");
    assert.notEqual(t.from, t.to);
    b[t.from] += t.cents;
    b[t.to] -= t.cents;
  }
  return b;
}

// Seeded random so a failure can be replayed.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomBalances(r, k, spread) {
  const v = [];
  let s = 0;
  for (let i = 0; i < k - 1; i++) {
    let x = 0;
    while (x === 0) x = Math.floor(r() * (2 * spread + 1)) - spread;
    v.push(x);
    s += x;
  }
  v.push(-s);
  return v;
}

// Brute force: the most zero-sum blocks over every set partition.
function bruteMaxBlocks(values) {
  let best = 0;
  const blocks = [];
  const go = (i) => {
    if (i === values.length) {
      if (blocks.every((b) => b.sum === 0)) best = Math.max(best, blocks.length);
      return;
    }
    for (const b of blocks) {
      b.sum += values[i];
      go(i + 1);
      b.sum -= values[i];
    }
    blocks.push({ sum: values[i] });
    go(i + 1);
    blocks.pop();
  };
  go(0);
  return best;
}

test("allocate splits to the cent with the leftover to the largest remainders (hand-worked)", () => {
  // 100.00 three ways: 33.333... each, one cent left over, to the first.
  assert.deepEqual(allocate(10000, [1, 1, 1]), [3334, 3333, 3333]);
  // 210.00 as shares 2:1:1:1:1 -> 70, 35, 35, 35, 35.
  assert.deepEqual(allocate(21000, [2, 1, 1, 1, 1]), [7000, 3500, 3500, 3500, 3500]);
  // 10.00 by 1:1:1:1:1:1:1 (7 people): 142.857... -> 143 x 6, 142 x 1.
  assert.deepEqual(allocate(1000, Array(7).fill(1)), [143, 143, 143, 143, 143, 143, 142]);
  // Remainders .6 .2 .2 -> 0.05 by 3:1:1 = 3, 1, 1.
  assert.deepEqual(allocate(5, [3, 1, 1]), [3, 1, 1]);
  // Zero weights get nothing.
  assert.deepEqual(allocate(101, [1, 0, 1]), [51, 0, 50]);
  for (let t = 0; t < 200; t++) {
    const r = rng(t);
    const w = Array.from({ length: 1 + Math.floor(r() * 9) }, () => Math.floor(r() * 5));
    if (!w.some((x) => x > 0)) continue;
    const total = Math.floor(r() * 100000);
    const parts = allocate(total, w);
    assert.equal(parts.reduce((a, b) => a + b, 0), total);
    const sum = w.reduce((a, b) => a + b, 0);
    parts.forEach((p, i) => assert.ok(Math.abs(p - (total * w[i]) / sum) < 1, "each part within a cent of its exact share"));
  }
});

test("amounts: decimal point, decimal comma and thousands", () => {
  assert.equal(parseAmount("84.50"), 84.5);
  assert.equal(parseAmount("12,50"), 12.5);
  assert.equal(parseAmount("12,5"), 12.5);
  assert.equal(parseAmount("1,200"), 1200);
  assert.equal(parseAmount("1.234,56"), 1234.56);
  assert.equal(parseAmount("1,234.56"), 1234.56);
  assert.equal(parseAmount("1 200"), 1200);
  assert.equal(parseAmount("1.200.000"), 1200000);
  assert.ok(Number.isNaN(parseAmount("12,3456")));
  assert.ok(Number.isNaN(parseAmount("abc")));
  assert.ok(Number.isNaN(parseAmount("-5")));
});

test("fewest transfers = people with a balance minus most zero-sum groups (Verhoeff 2004), checked by brute force", () => {
  for (let t = 0; t < 300; t++) {
    const r = rng(1000 + t);
    const k = 2 + Math.floor(r() * 6);
    const v = randomBalances(r, k, 6);
    if (v[v.length - 1] === 0) continue;
    const res = settleFewest(v);
    assert.equal(res.exact, true);
    assert.deepEqual(applied(v, res.transfers), v.map(() => 0));
    assert.equal(res.transfers.length, k - bruteMaxBlocks(v), `balances ${v}`);
    assert.ok(res.transfers.length <= settleGreedy(v).length, "never more than greedy");
    const groups = zeroSumGroups(v);
    for (const g of groups) assert.equal(g.reduce((s, i) => s + v[i], 0), 0);
    assert.equal(groups.flat().length, k);
  }
});

test("a case where largest-to-largest needs 5 transfers and the exact answer needs 4 (worked by hand)", () => {
  // Balances +3 +5 +4 +6 -6 -12. {+6, -6} squares in one transfer and
  // {+3, +5, +4, -12} in three: 4. Greedy matches +6 with -12 first and
  // then needs four more: 5.
  const v = [300, 500, 400, 600, -600, -1200];
  assert.equal(settleGreedy(v).length, 5);
  const f = settleFewest(v);
  assert.equal(f.transfers.length, 4);
  assert.ok(f.transfers.some((t) => t.from === 4 && t.to === 3 && t.cents === 600));
  assert.deepEqual(applied(v, f.transfers), v.map(() => 0));
});

test("the example trip: Dev's balance worked by hand", () => {
  const res = run(EXAMPLE);
  assert.deepEqual(res.errors, []);
  // Dev paid 210.00. Shares: apartment 640/5 = 128.00; groceries 86.40/5 =
  // 17.28; museum 120 USD x 0.92 = 110.40 / 4 = 27.60; dinner 210 x 1/6 =
  // 35.00; taxi 45/4 = 11.25; snacks 36 GBP x 1.18 = 42.48 / 5 = 8.496, and
  // 4,248 cents / 5 leaves 3 cents for Ana, Ben, Cara, so Dev 8.49.
  // 128 + 17.28 + 27.60 + 35 + 11.25 + 8.49 = 227.62; 210 - 227.62 = -17.62.
  assert.equal(res.book.net[3], -1762);
  assert.equal(res.book.net.reduce((a, b) => a + b, 0), 0);
  assert.equal(res.counts.nonzero, 5);
  assert.equal(res.transfers.length, 4);
  assert.match(transfersText(res), /Dev pays Ana 17\.62 EUR/);
});

test("every mode squares everyone on random trips", () => {
  for (let t = 0; t < 60; t++) {
    const r = rng(5000 + t);
    const n = 2 + Math.floor(r() * 7);
    const people = Array.from({ length: n }, (_, i) => `P${i}`);
    const lines = [];
    for (let e = 0; e < 1 + Math.floor(r() * 12); e++) {
      const payer = people[Math.floor(r() * n)];
      const amt = (1 + Math.floor(r() * 50000)) / 100;
      const who = people.filter(() => r() < 0.7);
      lines.push(`${payer} ${amt.toFixed(2)} thing${who.length ? " / " + who.map((p) => `${p}:${1 + Math.floor(r() * 3)}`).join(", ") : ""}`);
    }
    for (const mode of ["fewest", "greedy", "direct"]) {
      const res = run({ peopleText: people.join("\n"), linesText: lines.join("\n"), base: "USD", mode });
      assert.deepEqual(res.errors, [], lines.join("\n"));
      assert.deepEqual(applied(res.book.net, res.transfers), people.map(() => 0), mode);
      if (mode === "fewest") {
        assert.ok(res.transfers.length <= res.counts.greedy);
        assert.ok(res.transfers.length <= res.counts.direct);
        assert.ok(res.transfers.length <= Math.max(0, res.counts.nonzero - 1));
      }
    }
  }
});

test("direct mode pays back only people who paid for you", () => {
  const res = run({ peopleText: "A\nB\nC", linesText: "A 30 lunch\nB 60 dinner / B, C", base: "USD", mode: "direct" });
  // B owes A 10; C owes A 10 and owes B 30.
  const t = res.transfers.map((x) => `${res.people[x.from]}>${res.people[x.to]}:${x.cents}`).sort();
  assert.deepEqual(t, ["B>A:1000", "C>A:1000", "C>B:3000"]);
  const f = run({ peopleText: "A\nB\nC", linesText: "A 30 lunch\nB 60 dinner / B, C", base: "USD" });
  assert.equal(f.transfers.length, 2);
});

test("split styles, several payers and payments", () => {
  const people = parsePeople("Ana\nBen\nCara");
  const p = parseLines(
    ["Ana 90 a / Ana=50, Ben=40", "Ben 200 b / Ana=25%, Ben=75%", "Ana+Ben 100 c / Ana, Ben", "Ana=70+Ben=30 100 d / Cara", "Cara -> Ana 10", "2026-11-01 Cara €12,50 e / all -Ben"].join("\n"),
    people,
    "USD",
  );
  assert.deepEqual(p.errors, []);
  assert.equal(p.expenses[0].split.type, "exact");
  assert.equal(p.expenses[1].split.type, "percent");
  assert.equal(p.expenses[2].payers.length, 2);
  assert.equal(p.expenses[4].kind, "payment");
  assert.equal(p.expenses[5].cur, "EUR");
  assert.equal(p.expenses[5].amount, 12.5);
  assert.equal(p.expenses[5].date, "2026-11-01");
  assert.deepEqual(p.expenses[5].split.parts.map((x) => x.who), [0, 2]);
  const book = ledger(people, p.expenses.slice(0, 5), "USD", {});
  // Ana: paid 90 + 50 + 70 = 210, share 50 + 50 + 50 = 150, received 10.
  // Ben: paid 200 + 50 + 30 = 280, share 40 + 150 + 50 = 240.
  // Cara: share 100, sent 10.
  assert.deepEqual(book.net, [5000, 4000, -9000]);
});

test("errors name the line and what to fix", () => {
  const people = parsePeople("Ana, Ben");
  const bad = (line) => parseLines(line, people, "USD").errors.join(" ");
  assert.match(bad("Zed 10 x"), /Line 1: "Zed" is not in the group/);
  assert.match(bad("Ana 10 x / Ana=3, Ben=4"), /add to 7, not 10/);
  assert.match(bad("Ana 10 x / Ana=30%, Ben=60%"), /percents add to 90/);
  assert.match(bad("Ana=4+Ben=4 10 x"), /payers' amounts add to 8/);
  assert.match(bad("Ana 10 x / Ana:2, Ben=3"), /mix of split styles/);
  assert.match(bad("Ana -> Ana 5"), /two different people/);
  assert.match(bad("hello"), /write it as/);
  const res = run({ peopleText: "Ana\nBen", linesText: "Ana 10 CHF fondue", base: "EUR" });
  assert.match(res.errors.join(" "), /Add a rate for CHF/);
  assert.match(parseRates("EUR one").errors.join(" "), /Rate line 1/);
  assert.match(run({ peopleText: "Ana", linesText: "" }).errors.join(" "), /at least two people/);
});

test("zero-decimal currencies stay whole", () => {
  const res = run({ peopleText: "A\nB\nC", linesText: "A 1000 ramen", base: "JPY" });
  // 1,000 yen three ways: 334 (the leftover yen to the first), 333, 333.
  assert.deepEqual(res.book.net, [666, -333, -333]);
  assert.equal(formatMinor(1666, "JPY"), "1,666 JPY");
});

test("above the exact limit it still squares everyone, and says it is not proven fewest", () => {
  const r = rng(77);
  const v = randomBalances(r, EXACT_LIMIT + 6, 5000);
  const res = settleFewest(v);
  assert.equal(res.exact, false);
  assert.deepEqual(applied(v, res.transfers), v.map(() => 0));
  assert.ok(res.transfers.length <= v.filter((x) => x).length - 1);
});

test("20 balances solve exactly in well under two seconds", () => {
  const v = randomBalances(rng(9), EXACT_LIMIT, 300);
  const t0 = Date.now();
  const res = settleFewest(v);
  assert.equal(res.exact, true);
  assert.ok(Date.now() - t0 < 2000, `${Date.now() - t0} ms`);
  assert.deepEqual(applied(v, res.transfers), v.map(() => 0));
});

test("share links round-trip, including accents and emoji", () => {
  const s = { title: "Café crew 🍷", peopleText: "Zoë\nJosé", linesText: "Zoë 12 vin", base: "EUR", ratesText: "", mode: "greedy" };
  assert.deepEqual(decodeState(encodeState(s)), s);
  assert.equal(decodeState("not-a-link"), null);
  assert.ok(/^[A-Za-z0-9_-]+$/.test(encodeState(s)));
});

test("CSV exports guard formulas and recording a transfer squares it", () => {
  const res = run({ peopleText: "=cmd\nBen", linesText: "Ben 10 @sum", base: "USD" });
  assert.match(expensesCsv(res), /'@sum/);
  assert.match(transfersCsv(res), /^From,To,Amount USD\n'=cmd,Ben,5\.00\n$/);
  const line = paymentLine(res, res.transfers[0], "2026-11-23");
  assert.equal(line, "2026-11-23 =cmd -> Ben 5.00 USD settled up");
  const after = run({ peopleText: "=cmd\nBen", linesText: "Ben 10 @sum\n" + line, base: "USD" });
  assert.deepEqual(after.book.net, [0, 0]);
  assert.equal(transfersText(after), "Everyone is square.");
});
