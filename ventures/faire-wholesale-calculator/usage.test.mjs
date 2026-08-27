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
  recordUsage(storage, false, "link_copied");
  recordUsage(storage, false, "payout_float_compared");
  recordUsage(storage, false, "open_house_compared");
  recordUsage(storage, false, "promoted_compared");
  recordUsage(storage, false, "faire_return_compared");
  recordUsage(storage, false, "pay_now_compared");
  const stored = JSON.parse(values.get("faire-wholesale-usage"));
  assert.equal(stored.scenario_compared, 1);
  assert.equal(stored.link_copied, 1);
  assert.equal(stored.payout_float_compared, 1);
  assert.equal(stored.open_house_compared, 1);
  assert.equal(stored.promoted_compared, 1);
  assert.equal(stored.faire_return_compared, 1);
  assert.equal(stored.pay_now_compared, 1);
});

test("honors Do Not Track and Global Privacy Control", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const restore = () => {
    if (previous) Object.defineProperty(globalThis, "navigator", previous);
    else delete globalThis.navigator;
  };
  const memory = () => {
    const values = new Map();
    return {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    };
  };
  try {
    const dnt = memory();
    Object.defineProperty(globalThis, "navigator", {
      value: { doNotTrack: "1" },
      configurable: true,
    });
    recordUsage(dnt, false);
    assert.equal(dnt.getItem("faire-wholesale-usage"), null);

    const gpc = memory();
    Object.defineProperty(globalThis, "navigator", {
      value: { globalPrivacyControl: true },
      configurable: true,
    });
    recordUsage(gpc, false);
    assert.equal(gpc.getItem("faire-wholesale-usage"), null);
  } finally {
    restore();
  }
});
