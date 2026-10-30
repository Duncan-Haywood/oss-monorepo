// Seeded property test for convertCents (made-up amounts and rates, no outside data).
// Invariants: sign symmetry, rate 1 is the identity, monotone in amount and in rate,
// and the result is within half a cent of the exact product.
import { test } from "node:test";
import assert from "node:assert/strict";
import { convertCents } from "./fx.mjs";

const rng = (seed) => { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32); };

test("convertCents is symmetric, monotone and within half a cent of exact", () => {
  const r = rng(20261030);
  for (let i = 0; i < 2000; i++) {
    const cents = Math.floor(r() * 1e9), rate = Math.round((0.01 + r() * 9.99) * 1e6) / 1e6;
    const v = convertCents(cents, rate);
    const tag = JSON.stringify({ cents, rate });
    assert.equal(convertCents(-cents, rate), -v, "sign symmetry " + tag);
    assert.equal(convertCents(cents, 1), cents, "identity " + tag);
    assert.ok(convertCents(cents + 1, rate) >= v, "monotone in amount " + tag);
    assert.ok(convertCents(cents, rate + 0.000001) >= v, "monotone in rate " + tag);
    const exact = (BigInt(cents) * BigInt(Math.round(rate * 1e6))) ;
    assert.ok(Math.abs(Number(BigInt(v) * 1000000n - exact)) <= 500000, "half-cent bound " + tag);
  }
});
