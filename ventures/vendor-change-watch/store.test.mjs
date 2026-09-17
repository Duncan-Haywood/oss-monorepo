import test from "node:test";
import assert from "node:assert/strict";

import { makeSnapshot } from "./diff.mjs";
import {
  SNAPSHOTS_PER_WATCH,
  clearAll,
  getSnapshots,
  listWatches,
  removeWatch,
  saveSnapshot,
  watchId,
} from "./store.mjs";

/** Minimal `localStorage` stand-in; `throwOn` simulates a full or blocked store. */
function fakeStorage({ throwOn = null } = {}) {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => {
      if (throwOn) {
        const error = new Error("nope");
        error.name = throwOn;
        throw error;
      }
      data.set(k, v);
    },
    removeItem: (k) => data.delete(k),
  };
}

const snap = (content, overrides = {}) =>
  makeSnapshot({
    vendor: "Acme SaaS",
    pageUrl: "https://acme.example/legal/terms",
    pageType: "terms",
    content,
    ...overrides,
  });

test("first capture stores with nothing to compare against", () => {
  const storage = fakeStorage();
  const result = saveSnapshot(storage, snap("Terms\n\nA.", { capturedAt: "2026-08-01T00:00:00Z" }));
  assert.equal(result.stored, true);
  assert.equal(result.previous, null);
  assert.equal(result.snapshots.length, 1);
});

test("second capture offers the previous one as the diff basis", () => {
  const storage = fakeStorage();
  saveSnapshot(storage, snap("Terms\n\nA.", { capturedAt: "2026-08-01T00:00:00Z" }));
  const second = saveSnapshot(storage, snap("Terms\n\nB.", { capturedAt: "2026-09-01T00:00:00Z" }));
  assert.equal(second.previous.captured_at, "2026-08-01T00:00:00Z");
  assert.equal(second.snapshots.length, 2);
});

test("keeps only the newest pair so storage cannot grow without bound", () => {
  const storage = fakeStorage();
  for (const day of ["01", "02", "03", "04"]) {
    saveSnapshot(storage, snap(`Terms\n\n${day}`, { capturedAt: `2026-09-${day}T00:00:00Z` }));
  }
  const kept = getSnapshots(storage, watchId(snap("Terms\n\nx")));
  assert.equal(kept.length, SNAPSHOTS_PER_WATCH);
  assert.equal(kept[0].captured_at, "2026-09-03T00:00:00Z");
  assert.equal(kept[1].captured_at, "2026-09-04T00:00:00Z");
});

test("a full store reports the failure instead of pretending it saved", () => {
  const storage = fakeStorage({ throwOn: "QuotaExceededError" });
  const result = saveSnapshot(storage, snap("Terms\n\nA."));
  assert.equal(result.stored, false);
  assert.equal(result.reason, "quota");
});

test("a blocked store is distinguished from a full one", () => {
  const storage = fakeStorage({ throwOn: "SecurityError" });
  assert.equal(saveSnapshot(storage, snap("Terms\n\nA.")).reason, "blocked");
  assert.equal(saveSnapshot(null, snap("Terms\n\nA.")).reason, "no-storage");
});

test("watches separate by vendor, page type and URL", () => {
  const storage = fakeStorage();
  saveSnapshot(storage, snap("Terms\n\nA.", { capturedAt: "2026-09-01T00:00:00Z" }));
  saveSnapshot(storage, snap("Privacy\n\nB.", {
    pageType: "privacy", pageUrl: "https://acme.example/legal/privacy", capturedAt: "2026-09-02T00:00:00Z",
  }));
  saveSnapshot(storage, snap("Terms\n\nC.", { vendor: "Beta Ltd", capturedAt: "2026-09-03T00:00:00Z" }));

  const watches = listWatches(storage);
  assert.equal(watches.length, 3);
  // Newest capture first, so the page a reader just touched is at the top.
  assert.equal(watches[0].vendor, "Beta Ltd");
});

test("a vendor name containing a space survives the round trip through the key", () => {
  // The separator has to be something a name cannot contain: split on a space
  // and "Acme SaaS" comes back as "Acme", mislabelling every row in the list.
  const storage = fakeStorage();
  saveSnapshot(storage, snap("Terms\n\nA.", { vendor: "Acme SaaS", pageType: "master terms" }));
  const [watch] = listWatches(storage);
  assert.equal(watch.vendor, "Acme SaaS");
  assert.equal(watch.pageType, "master terms");
  assert.equal(watch.pageUrl, "https://acme.example/legal/terms");
});

test("corrupt stored JSON reads as empty rather than throwing", () => {
  const storage = fakeStorage();
  storage.setItem("vendor-change-watch-snapshots", "{not json");
  assert.deepEqual(listWatches(storage), []);
  assert.equal(saveSnapshot(storage, snap("Terms\n\nA.")).stored, true);
});

test("forgetting one watch leaves the others", () => {
  const storage = fakeStorage();
  saveSnapshot(storage, snap("Terms\n\nA."));
  saveSnapshot(storage, snap("Privacy\n\nB.", { pageType: "privacy" }));
  removeWatch(storage, watchId(snap("Terms\n\nA.")));
  const watches = listWatches(storage);
  assert.equal(watches.length, 1);
  assert.equal(watches[0].pageType, "privacy");
});

test("clearing removes everything", () => {
  const storage = fakeStorage();
  saveSnapshot(storage, snap("Terms\n\nA."));
  clearAll(storage);
  assert.deepEqual(listWatches(storage), []);
});
