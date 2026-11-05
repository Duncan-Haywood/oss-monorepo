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
