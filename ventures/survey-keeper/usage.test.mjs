import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { record, readUsage, setUsageOptOut, usageOptedOut } from "./usage.mjs";

function fakeStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

beforeEach(() => {
  globalThis.localStorage = fakeStorage();
  globalThis.__usageOptOut = false;
  Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true });
});

test("record counts events, and readUsage reads them back", () => {
  record("article_viewed");
  record("article_viewed");
  record("search_run");
  const usage = readUsage();
  assert.equal(usage.article_viewed, 2);
  assert.equal(usage.search_run, 1);
});

test("opting out clears existing counters and stops new ones", () => {
  record("article_viewed");
  setUsageOptOut(true);
  assert.equal(usageOptedOut(), true);
  assert.deepEqual(readUsage(), {});
  record("article_viewed");
  assert.deepEqual(readUsage(), {});
});

test("opting back in lets counting resume", () => {
  setUsageOptOut(true);
  setUsageOptOut(false);
  assert.equal(usageOptedOut(), false);
  record("article_viewed");
  assert.equal(readUsage().article_viewed, 1);
});

test("Do Not Track is honoured even without an explicit opt-out", () => {
  globalThis.navigator.doNotTrack = "1";
  record("article_viewed");
  assert.deepEqual(readUsage(), {});
});

test("a missing localStorage never throws", () => {
  delete globalThis.localStorage;
  assert.doesNotThrow(() => record("article_viewed"));
  assert.deepEqual(readUsage(), {});
});

test("corrupt stored JSON is treated as empty rather than thrown", () => {
  globalThis.localStorage.setItem("survey-keeper-usage", "not json");
  assert.deepEqual(readUsage(), {});
  record("article_viewed");
  assert.equal(readUsage().article_viewed, 1);
});

test("the opt-out survives a page reload (fresh realm, same storage)", () => {
  setUsageOptOut(true);
  globalThis.__usageOptOut = false; // what a new page load looks like
  assert.equal(usageOptedOut(), true);
  record("article_viewed");
  assert.deepEqual(readUsage(), {});
});

test("Global Privacy Control is honoured", () => {
  globalThis.navigator.globalPrivacyControl = true;
  record("article_viewed");
  assert.deepEqual(readUsage(), {});
});
