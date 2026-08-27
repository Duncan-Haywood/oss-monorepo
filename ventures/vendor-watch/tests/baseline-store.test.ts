import assert from "node:assert/strict";
import test from "node:test";
import {
  BASELINE_STORAGE_KEY,
  MAX_TRACKED_URLS,
  clearBaselines,
  getBaseline,
  listBaselines,
  removeBaseline,
  saveBaseline,
  type Baseline,
  type BaselineStorage,
} from "../src/lib/baseline-store";

function memoryStorage(initial: Record<string, string> = {}): BaselineStorage {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

function refusingStorage(): BaselineStorage {
  return {
    getItem: () => {
      throw new Error("site data blocked");
    },
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
    removeItem: () => {
      throw new Error("site data blocked");
    },
  };
}

function baseline(url: string, fetchedAt: string, text = "page text"): Baseline {
  return { url, normalizedText: text, hash: `hash-of-${text}`, fetchedAt, httpStatus: 200 };
}

test("round-trips a baseline for a URL", () => {
  const storage = memoryStorage();
  assert.equal(saveBaseline(storage, baseline("https://a.example/terms", "2026-08-26T10:00:00.000Z")), true);
  const found = getBaseline(storage, "https://a.example/terms");
  assert.equal(found?.hash, "hash-of-page text");
  assert.equal(found?.httpStatus, 200);
});

test("returns nothing for a URL that was never checked", () => {
  assert.equal(getBaseline(memoryStorage(), "https://a.example/never"), null);
});

test("replaces the baseline for a URL rather than accumulating copies", () => {
  const storage = memoryStorage();
  saveBaseline(storage, baseline("https://a.example/terms", "2026-08-26T10:00:00.000Z", "old"));
  saveBaseline(storage, baseline("https://a.example/terms", "2026-08-26T11:00:00.000Z", "new"));
  assert.equal(listBaselines(storage).length, 1);
  assert.equal(getBaseline(storage, "https://a.example/terms")?.normalizedText, "new");
});

test("lists baselines newest first", () => {
  const storage = memoryStorage();
  saveBaseline(storage, baseline("https://a.example/old", "2026-08-20T10:00:00.000Z"));
  saveBaseline(storage, baseline("https://a.example/new", "2026-08-26T10:00:00.000Z"));
  assert.deepEqual(
    listBaselines(storage).map((entry) => entry.url),
    ["https://a.example/new", "https://a.example/old"],
  );
});

test("evicts the least recently fetched URL once the cap is reached", () => {
  const storage = memoryStorage();
  // Ascending timestamps, so url0 is the least recently fetched throughout.
  for (let i = 0; i < MAX_TRACKED_URLS; i += 1) {
    const minute = String(i).padStart(2, "0");
    saveBaseline(storage, baseline(`https://a.example/${i}`, `2026-08-26T10:${minute}:00.000Z`));
  }
  assert.equal(listBaselines(storage).length, MAX_TRACKED_URLS);

  saveBaseline(storage, baseline("https://a.example/newest", "2026-08-26T23:59:00.000Z"));
  const urls = listBaselines(storage).map((entry) => entry.url);
  assert.equal(urls.length, MAX_TRACKED_URLS);
  assert.ok(urls.includes("https://a.example/newest"));
  assert.equal(urls.includes("https://a.example/0"), false, "oldest should have been evicted");
});

test("re-checking a tracked URL at the cap evicts nothing", () => {
  const storage = memoryStorage();
  for (let i = 0; i < MAX_TRACKED_URLS; i += 1) {
    const minute = String(i).padStart(2, "0");
    saveBaseline(storage, baseline(`https://a.example/${i}`, `2026-08-26T10:${minute}:00.000Z`));
  }
  saveBaseline(storage, baseline("https://a.example/0", "2026-08-26T23:59:00.000Z", "refreshed"));
  const urls = listBaselines(storage).map((entry) => entry.url);
  assert.equal(urls.length, MAX_TRACKED_URLS);
  assert.equal(getBaseline(storage, "https://a.example/0")?.normalizedText, "refreshed");
});

test("forgets a single URL and keeps the rest", () => {
  const storage = memoryStorage();
  saveBaseline(storage, baseline("https://a.example/keep", "2026-08-26T10:00:00.000Z"));
  saveBaseline(storage, baseline("https://a.example/drop", "2026-08-26T11:00:00.000Z"));
  removeBaseline(storage, "https://a.example/drop");
  assert.deepEqual(
    listBaselines(storage).map((entry) => entry.url),
    ["https://a.example/keep"],
  );
});

test("clearBaselines empties the store", () => {
  const storage = memoryStorage();
  saveBaseline(storage, baseline("https://a.example/terms", "2026-08-26T10:00:00.000Z"));
  clearBaselines(storage);
  assert.deepEqual(listBaselines(storage), []);
});

test("drops stored entries that do not re-validate", () => {
  // Hand-edited or written by an older build: keep the good rows, drop the rest
  // rather than handing a malformed baseline to the diff.
  const storage = memoryStorage({
    [BASELINE_STORAGE_KEY]: JSON.stringify([
      baseline("https://a.example/good", "2026-08-26T10:00:00.000Z"),
      { url: "https://a.example/bad", hash: "" },
      "not an object",
      null,
    ]),
  });
  assert.deepEqual(
    listBaselines(storage).map((entry) => entry.url),
    ["https://a.example/good"],
  );
});

test("treats unparseable and non-array stored values as empty", () => {
  assert.deepEqual(listBaselines(memoryStorage({ [BASELINE_STORAGE_KEY]: "{not json" })), []);
  assert.deepEqual(listBaselines(memoryStorage({ [BASELINE_STORAGE_KEY]: '{"a":1}' })), []);
});

test("survives a browser that refuses site data", () => {
  const storage = refusingStorage();
  assert.deepEqual(listBaselines(storage), []);
  assert.equal(saveBaseline(storage, baseline("https://a.example/terms", "2026-08-26T10:00:00.000Z")), false);
  assert.equal(clearBaselines(storage), false);
});

test("treats a missing storage as empty rather than throwing", () => {
  assert.deepEqual(listBaselines(null), []);
  assert.equal(getBaseline(null, "https://a.example/terms"), null);
  assert.equal(saveBaseline(null, baseline("https://a.example/terms", "2026-08-26T10:00:00.000Z")), false);
  assert.equal(removeBaseline(null, "https://a.example/terms"), false);
});
