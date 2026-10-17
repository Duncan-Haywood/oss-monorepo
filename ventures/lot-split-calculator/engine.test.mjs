import test from "node:test";
import assert from "node:assert/strict";
import { parseLines, plan, lineValues, breakEvenRate, summarize, money } from "./engine.mjs";

const O = { feePct: 13, remnantPct: 20, hourlyRate: 15, lotOffer: 0, lotCost: 0, downside: 80 };

test("parse accepts header, comments, notes; reports each bad row", () => {
  const ok = parseLines("item,qty,price,sell_through,shipping,minutes\n# c\nA,2,10,50,3,5,a note, with comma\n");
  assert.equal(ok.errors.length, 0);
  assert.equal(ok.items[0].note, "a note,with comma");
  const bad = parseLines("A,2,10\nB,0,10,50,3,5\nC,1,-1,50,3,5\nD,1,1,101,3,5\nE,1,1,50,-3,5\nF,1,1,50,3,x\n,1,1,50,3,5");
  assert.equal(bad.errors.length, 7);
});

test("line value matches the written formula", () => {
  const it = { name: "x", qty: 4, price: 50, sellThrough: 80, shipping: 10, minutes: 12 };
  const v = lineValues(it, O);
  const perUnit = 0.8 * (50 * 0.87 - 10) + 0.2 * 50 * 0.2;
  assert.ok(Math.abs(v.list - 4 * (perUnit - 12 / 60 * 15)) < 1e-9);
  assert.equal(v.dump, 40);
});

function rng(seed) { let s = seed; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; }

test("best mix equals brute force over every list-or-dump choice (300 random lots)", () => {
  const r = rng(7);
  for (let n = 0; n < 300; n += 1) {
    const items = Array.from({ length: 1 + Math.floor(r() * 9) }, (_, i) => ({
      name: `i${i}`, qty: 1 + Math.floor(r() * 12), price: Math.round(r() * 120), sellThrough: Math.round(r() * 100),
      shipping: Math.round(r() * 20), minutes: Math.round(r() * 30), note: "",
    }));
    const opts = { feePct: Math.round(r() * 30), remnantPct: Math.round(r() * 50), hourlyRate: Math.round(r() * 40) };
    const p = plan({ items }, opts);
    let best = -Infinity;
    for (let mask = 0; mask < 1 << items.length; mask += 1) {
      let t = 0;
      items.forEach((it, i) => { const v = lineValues(it, p.options); t += mask & (1 << i) ? v.list : v.dump; });
      best = Math.max(best, t);
    }
    assert.ok(Math.abs(best - p.totals.bestMix) < 1e-7, `lot ${n}`);
    assert.ok(p.totals.bestMix >= p.totals.allListed - 1e-9);
  }
});

test("break-even rate ties the offer to the best mix", () => {
  const { items } = parseLines("A,6,28,85,9,12\nB,4,45,90,14,10\nC,10,4,95,6,3");
  const o = { ...O, lotOffer: 150 };
  const be = breakEvenRate(items, o);
  assert.ok(be > 0 && Number.isFinite(be));
  const at = plan({ items }, { lotOffer: 150, hourlyRate: be });
  assert.ok(Math.abs(at.totals.bestMix - 150) < 1e-4);
  assert.equal(plan({ items }, { lotOffer: 150, hourlyRate: be + 5 }).best, "whole");
  assert.equal(plan({ items }, { lotOffer: 150, hourlyRate: Math.max(0, be - 5) }).best, "split");
});

test("worked example: fixture splits beat a $260 offer, a $450 offer wins", () => {
  const text = "Pyrex,6,28,85,9,12\nSkillets,4,45,90,14,10";
  const a = plan(parseLines(text), { lotOffer: 100 });
  assert.equal(a.best, "split");
  assert.equal(summarize(a).status, "gain");
  const b = plan(parseLines(text), { lotOffer: 900 });
  assert.equal(b.best, "whole");
  assert.equal(summarize(b).status, "whole");
  assert.equal(summarize(plan(parseLines(text))).status, "split-only");
});

test("bad options and empty lots throw; money formats", () => {
  assert.throws(() => plan({ items: [] }));
  assert.throws(() => plan(parseLines("A,1,1,50,1,1"), { feePct: 120 }));
  assert.equal(money(-1234.5), "-$1,234.50");
});
