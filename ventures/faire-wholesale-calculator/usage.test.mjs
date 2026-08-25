import test from "node:test";
import assert from "node:assert/strict";
import { recordUsage } from "./usage.mjs";

test("records only an aggregate local event", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  recordUsage(storage);
  const event = JSON.parse(values.get("faire-wholesale-usage"));
  assert.equal(event.brand_order_calculated, 1);
  assert.match(event.last_day, /^\d{4}-\d{2}-\d{2}$/);
});

test("honors opt out", () => {
  let called = false;
  recordUsage({ setItem: () => { called = true; } }, true);
  assert.equal(called, false);
});

test("supports a named aggregate event without recording inputs", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  recordUsage(storage, false, "scenario_compared");
  assert.equal(JSON.parse(values.get("faire-wholesale-usage")).scenario_compared, 1);
});
