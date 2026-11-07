import { test } from "node:test";
import assert from "node:assert/strict";
import { textNumberErrors } from "./numfields.mjs";

test("numbers, missing keys and null pass", () => {
  assert.deepEqual(textNumberErrors({ a: 1, b: 0, c: null }, ["a", "b", "c", "d"]), []);
});

test("text, NaN, Infinity, objects, booleans are refused by key", () => {
  for (const bad of ["12", NaN, Infinity, -Infinity, {}, [], true]) {
    assert.deepEqual(textNumberErrors({ a: bad }, ["a"]), ["a must be a number."], String(bad));
  }
});

test("keys not listed are not checked", () => {
  assert.deepEqual(textNumberErrors({ a: "x" }, []), []);
});

test("price keys must be 0 to 1e9; other keys have no range", () => {
  assert.deepEqual(textNumberErrors({ gallonPrice: 0, studPrice: 1e9 }, ["gallonPrice", "studPrice"]), []);
  assert.equal(textNumberErrors({ gallonPrice: -0.01 }, ["gallonPrice"]).length, 1);
  assert.equal(textNumberErrors({ studPrice: 1e9 + 1 }, ["studPrice"]).length, 1);
  assert.deepEqual(textNumberErrors({ coats: -5 }, ["coats"]), []);
});

test("a missing or non-object settings value is not a raw TypeError (found 2026-11-07)", () => {
  for (const d of [null, undefined, 5, "x", true]) assert.deepEqual(textNumberErrors(d, ["a", "bPrice"]), [], String(d));
});

test("seeded fuzz: every key is flagged exactly when it is present and not a finite number or an out-of-range price", () => {
  let t = 7;
  const rand = () => ((t = (t * 1664525 + 1013904223) >>> 0) / 4294967296);
  const vals = [0, 1, -1, 12.5, 1e9, 1e9 + 1, NaN, Infinity, "3", "", null, undefined, {}, [], true];
  const keys = ["a", "gallonPrice", "unitPRICE", "pricey"];
  for (let i = 0; i < 400; i++) {
    const d = {};
    for (const k of keys) if (rand() < 0.8) d[k] = vals[Math.floor(rand() * vals.length)];
    const want = [];
    for (const k of keys) {
      const v = d[k];
      if (v == null) continue;
      if (typeof v !== "number" || !Number.isFinite(v)) want.push(`${k} must be a number.`);
      else if (/price$/i.test(k) && (v < 0 || v > 1e9)) want.push(`${k} must be from 0 to 1,000,000,000.`);
    }
    assert.deepEqual(textNumberErrors(d, keys), want, JSON.stringify(d));
  }
});
