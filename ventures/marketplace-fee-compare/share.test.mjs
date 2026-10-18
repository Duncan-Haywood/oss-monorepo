import assert from "node:assert/strict";
import { test } from "node:test";
import { CHANNEL_IDS } from "./calc.mjs";
import { decodeShare, encodeShare, ITEM_FIELDS } from "./share.mjs";

test("round-trips every item field the page collects", () => {
  const item = {
    price: "129.99",
    shippingCharged: "6.5",
    itemCost: "40",
    shippingCost: "5.25",
    otherCost: "1.5",
    monthlyOrders: "80",
    categoryId: "jewelry",
  };
  const encoded = encodeShare(item, {});
  const decoded = decodeShare(encoded);
  for (const field of ITEM_FIELDS) {
    assert.equal(decoded.item[field], item[field], `${field} did not round-trip`);
  }
});

// The exact bug class this module exists to prevent: ITEM_FIELDS is meant to
// mirror the page's FIELD_IDS list. If a field is ever added to the form and
// not to this allowlist, a shared link would silently drop it and the sender
// and recipient would see different numbers from the "same" link.
test("the share allowlist covers every field the page's form collects", () => {
  const FIELD_IDS = [
    "price", "shippingCharged", "itemCost", "shippingCost",
    "otherCost", "monthlyOrders", "categoryId",
  ];
  assert.deepEqual([...ITEM_FIELDS].sort(), [...FIELD_IDS].sort());
});

test("round-trips a rate override for every channel", () => {
  const overrides = Object.fromEntries(CHANNEL_IDS.map((id, index) => [id, String(index + 1)]));
  const decoded = decodeShare(encodeShare({}, overrides));
  for (const id of CHANNEL_IDS) {
    assert.equal(decoded.overrides[id], overrides[id]);
  }
});

test("omits an override that was left blank rather than sharing an empty string", () => {
  const encoded = encodeShare({ price: "40" }, { ebay: "", etsy: "12" });
  const decoded = decodeShare(encoded);
  assert.equal("ebay" in decoded.overrides, false);
  assert.equal(decoded.overrides.etsy, "12");
});

test("a broken payload is null, not a throw", () => {
  assert.equal(decodeShare("not-json"), null);
  assert.equal(decodeShare(""), null);
  assert.equal(decodeShare(undefined), null);
  assert.equal(decodeShare("#"), null);
  assert.equal(decodeShare(encodeURIComponent(JSON.stringify([1, 2]))), null);
});

test("an empty payload (nothing shareable set) decodes to null", () => {
  assert.equal(decodeShare(encodeShare({}, {})), null);
});

test("does not encode fields outside the allowlist", () => {
  const encoded = encodeShare(
    { price: "40", notes: "reselling from a supplier in Ohio" },
    { ebay: "13", madeUpChannel: "99" },
  );
  assert.equal(encoded.toLowerCase().includes("ohio"), false);
  assert.equal(decodeShare(encoded).overrides.madeUpChannel, undefined);
});

test("strips the leading # so a raw location.hash decodes the same as a bare fragment", () => {
  const encoded = encodeShare({ price: "55" }, {});
  assert.deepEqual(decodeShare(`#${encoded}`), decodeShare(encoded));
});

test("advertising rates round-trip and unknown channels are dropped", () => {
  const decoded = decodeShare(encodeShare({ price: "20" }, {}, { etsy: "15", bogus: "9" }));
  assert.equal(decoded.adRates.etsy, "15");
  assert.equal("bogus" in decoded.adRates, false);
});
