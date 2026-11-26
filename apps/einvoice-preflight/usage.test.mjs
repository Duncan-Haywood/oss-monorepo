import { test } from "node:test";
import assert from "node:assert/strict";
import { recordUsage } from "./usage.mjs";

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, value),
  };
}

test("records only an aggregate local event, never invoice contents", () => {
  const storage = fakeStorage();
  recordUsage(storage, false, "invoice_preflight_attempted");
  recordUsage(storage, false, "invoice_preflight_checked");
  recordUsage(storage, false, "invoice_preflight_checked");
  const stored = JSON.parse(storage.getItem("einvoice-preflight-usage"));
  assert.equal(stored.invoice_preflight_attempted, 1);
  assert.equal(stored.invoice_preflight_checked, 2);
  assert.ok(stored.last_day);
  assert.deepEqual(Object.keys(stored).sort(), [
    "invoice_preflight_attempted",
    "invoice_preflight_checked",
    "last_day",
  ]);
});

test("honors opt out", () => {
  const storage = fakeStorage();
  recordUsage(storage, true);
  assert.equal(storage.getItem("einvoice-preflight-usage"), null);
});

test("honors Do Not Track and Global Privacy Control", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const restore = () => {
    if (previous) Object.defineProperty(globalThis, "navigator", previous);
    else delete globalThis.navigator;
  };
  try {
    const dntStorage = fakeStorage();
    Object.defineProperty(globalThis, "navigator", {
      value: { doNotTrack: "1" },
      configurable: true,
    });
    recordUsage(dntStorage, false);
    assert.equal(dntStorage.getItem("einvoice-preflight-usage"), null);

    const gpcStorage = fakeStorage();
    Object.defineProperty(globalThis, "navigator", {
      value: { globalPrivacyControl: true },
      configurable: true,
    });
    recordUsage(gpcStorage, false);
    assert.equal(gpcStorage.getItem("einvoice-preflight-usage"), null);
  } finally {
    restore();
  }
});

test("is a no-op without storage", () => {
  assert.doesNotThrow(() => recordUsage(undefined, false));
  assert.doesNotThrow(() => recordUsage(null, false));
});
