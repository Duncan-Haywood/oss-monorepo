import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeComparison, encodeComparison } from "./share.mjs";

test("round-trips booking assumptions and per-channel rates", () => {
  const encoded = encodeComparison(
    { nightlyRate: 225, nights: 2, cleaningFee: 95, bookingsPerYear: 36 },
    [{ id: "direct", enabled: true, processingRate: 2.9, occupancyKeep: 70 }],
  );
  const decoded = decodeComparison(encoded);
  assert.equal(decoded.booking.nightlyRate, 225);
  assert.equal(decoded.booking.nights, 2);
  assert.equal(decoded.channels[0].id, "direct");
  assert.equal(decoded.channels[0].occupancyKeep, 70);
});

test("drops non-numeric and negative values rather than sharing junk", () => {
  const encoded = encodeComparison(
    { nightlyRate: "nope", nights: -1, cleaningFee: 95 },
    [{ id: "airbnb-host-only", hostFeeRate: -3 }],
  );
  const decoded = decodeComparison(encoded);
  assert.equal(decoded.booking.nightlyRate, undefined);
  assert.equal(decoded.booking.nights, undefined);
  assert.equal(decoded.booking.cleaningFee, 95);
  assert.equal(decoded.channels[0].hostFeeRate, undefined);
});

test("a broken payload is null, not a throw", () => {
  assert.equal(decodeComparison("not-json"), null);
  assert.equal(decodeComparison(""), null);
  assert.equal(decodeComparison(undefined), null);
});

test("does not encode fields outside the allowlist", () => {
  const encoded = encodeComparison(
    { nightlyRate: 200, notes: "lake house on Maple St" },
    [{ id: "direct", address: "12 Maple" }],
  );
  assert.equal(encoded.includes("Maple"), false);
  assert.equal(encoded.includes("notes"), false);
  assert.equal(encoded.includes("address"), false);
});
