import assert from "node:assert/strict";
import { test } from "node:test";

import { buildSpec, encodeShare, decodeShare, saveShare, loadShare, clearShare, restoreShare } from "./share.mjs";

// A stand-in spec, not this venture's real field list -- restating the real
// list here would be a second copy to keep in sync with index.html, exactly
// the drift this module exists to avoid. The tie between the real form and
// what a link carries is asserted in html.test.mjs, against the page source
// and against calc.mjs's own readers.
const SPEC = buildSpec(
  ["ticketPrice", "foodCost"],
  ["listedPrice", "commissionRate", "paymentFixed"],
  ["dine-in", "doordash", "other"],
);

function fakeStorage({ throws = false } = {}) {
  const map = new Map();
  return {
    getItem: (key) => {
      if (throws) throw new Error("blocked");
      return map.has(key) ? map.get(key) : null;
    },
    setItem: (key, value) => {
      if (throws) throw new Error("blocked");
      map.set(key, String(value));
    },
    removeItem: (key) => {
      if (throws) throw new Error("blocked");
      map.delete(key);
    },
    size: () => map.size,
  };
}

test("a full comparison round-trips through a link unchanged", () => {
  const values = {
    ticketPrice: "32",
    foodCost: "9.6",
    channels: [
      { id: "dine-in", enabled: "1", listedPrice: "32", commissionRate: "0", paymentFixed: "0.3" },
      { id: "doordash", enabled: "1", listedPrice: "44", commissionRate: "27", paymentFixed: "0" },
    ],
  };
  assert.deepEqual(decodeShare(SPEC, encodeShare(SPEC, values)), values);
});

test("the fragment accepts a leading '#' or '?' or neither", () => {
  const values = { ticketPrice: "32", channels: [{ id: "dine-in", enabled: "0" }] };
  const query = encodeShare(SPEC, values);
  assert.deepEqual(decodeShare(SPEC, `#${query}`), decodeShare(SPEC, query));
  assert.deepEqual(decodeShare(SPEC, `?${query}`), decodeShare(SPEC, query));
});

test("a channel id the spec does not know is dropped, not passed through", () => {
  // A crafted or stale link cannot address a channel this build has no rate
  // table for -- CHANNEL_PRESETS is the allowlist, sourced straight from
  // calc.mjs by the page, and this spec mirrors that shape.
  const query = "channels=made-up-channel:99:5:0:1";
  assert.deepEqual(decodeShare(SPEC, query), {});
});

test("a row missing some fields restores only the fields present, so the calculator falls back to that channel's own default for the rest", () => {
  const values = { channels: [{ id: "doordash", commissionRate: "30" }] };
  const decoded = decodeShare(SPEC, encodeShare(SPEC, values));
  assert.deepEqual(decoded.channels, [{ id: "doordash", commissionRate: "30" }]);
  assert.ok(!("listedPrice" in decoded.channels[0]));
  assert.ok(!("enabled" in decoded.channels[0]));
});

test("a negative or non-numeric field is dropped rather than carried through as garbage", () => {
  const decoded = decodeShare(SPEC, "ticketPrice=-5&foodCost=notanumber");
  assert.deepEqual(decoded, {});
});

test("an unrelated query parameter is ignored", () => {
  const decoded = decodeShare(SPEC, "ticketPrice=32&utm_source=chat");
  assert.deepEqual(decoded, { ticketPrice: "32" });
});

test("save, load and clear round-trip through the visitor's own storage", () => {
  const storage = fakeStorage();
  const values = { ticketPrice: "40", channels: [{ id: "dine-in", enabled: "1" }] };
  assert.equal(saveShare(storage, SPEC, values), true);
  assert.deepEqual(loadShare(storage, SPEC), values);
  assert.equal(clearShare(storage, SPEC), true);
  assert.deepEqual(loadShare(storage, SPEC), {});
});

test("a browser that blocks site data fails saving and loading without throwing", () => {
  const storage = fakeStorage({ throws: true });
  assert.equal(saveShare(storage, SPEC, { ticketPrice: "40" }), false);
  assert.deepEqual(loadShare(storage, SPEC), {});
  assert.equal(clearShare(storage, SPEC), false);
});

test("a hand-edited or older-build blob in storage is re-validated on load, not trusted", () => {
  const storage = fakeStorage();
  storage.setItem(
    SPEC.key,
    JSON.stringify({ v: 1, values: { ticketPrice: "-99", channels: [{ id: "not-a-real-channel" }] } }),
  );
  assert.deepEqual(loadShare(storage, SPEC), {});
});

test("a link wins over a saved comparison", () => {
  const storage = fakeStorage();
  saveShare(storage, SPEC, { ticketPrice: "40" });
  const restored = restoreShare(SPEC, { hash: "#ticketPrice=55", storage });
  assert.equal(restored.source, "link");
  assert.deepEqual(restored.values, { ticketPrice: "55" });
});

test("a plain visit with no link falls back to the saved comparison", () => {
  const storage = fakeStorage();
  saveShare(storage, SPEC, { ticketPrice: "40" });
  const restored = restoreShare(SPEC, { hash: "", storage });
  assert.equal(restored.source, "storage");
  assert.deepEqual(restored.values, { ticketPrice: "40" });
});

test("a first visit with neither a link nor a save reports 'none'", () => {
  const restored = restoreShare(SPEC, { hash: "", storage: fakeStorage() });
  assert.deepEqual(restored, { values: {}, source: "none" });
});

test("more rows than the ceiling are truncated, not rejected outright", () => {
  const many = Array.from({ length: 30 }, (_, index) => ({ id: index % 2 === 0 ? "dine-in" : "doordash" }));
  const decoded = decodeShare(SPEC, encodeShare(SPEC, { channels: many }));
  assert.equal(decoded.channels.length, 20);
});
