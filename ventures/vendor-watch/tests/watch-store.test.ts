import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clearWatchStoreForTests,
  getSnapshot,
  getTrackedUrlCount,
  saveSnapshot,
} from "../src/lib/watch-store";

test("stores and retrieves a snapshot by URL", () => {
  clearWatchStoreForTests();
  saveSnapshot({
    url: "https://example.com/terms",
    normalizedText: "hello world",
    hash: "abc",
    fetchedAt: "2026-08-24T00:00:00.000Z",
    httpStatus: 200,
  });

  const snapshot = getSnapshot("https://example.com/terms");
  assert.ok(snapshot);
  assert.equal(snapshot?.normalizedText, "hello world");
  assert.equal(getTrackedUrlCount(), 1);
});

test("updating an existing URL does not grow the tracked count", () => {
  clearWatchStoreForTests();
  saveSnapshot({
    url: "https://example.com/terms",
    normalizedText: "v1",
    hash: "a",
    fetchedAt: "2026-08-24T00:00:00.000Z",
    httpStatus: 200,
  });
  saveSnapshot({
    url: "https://example.com/terms",
    normalizedText: "v2",
    hash: "b",
    fetchedAt: "2026-08-24T00:01:00.000Z",
    httpStatus: 200,
  });

  assert.equal(getTrackedUrlCount(), 1);
  assert.equal(getSnapshot("https://example.com/terms")?.normalizedText, "v2");
});

test("bounds the number of distinct tracked URLs, evicting the oldest", () => {
  clearWatchStoreForTests();
  for (let index = 0; index < 201; index += 1) {
    saveSnapshot({
      url: `https://example.com/page-${index}`,
      normalizedText: "x",
      hash: String(index),
      fetchedAt: "2026-08-24T00:00:00.000Z",
      httpStatus: 200,
    });
  }

  assert.equal(getTrackedUrlCount(), 200);
  // The very first URL saved should have been evicted to make room.
  assert.equal(getSnapshot("https://example.com/page-0"), undefined);
  // The most recently saved URL must still be present.
  assert.ok(getSnapshot("https://example.com/page-200"));
});
