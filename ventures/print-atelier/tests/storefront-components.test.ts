import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveBuyerShippingAddress,
  describeMissingBuyerShipping,
  extractStripeShippingMetadata,
  shippingAddressCollectionCountries,
} from "../src/lib/buyer-shipping.ts";
import {
  predictCustomsClearanceAging,
  summarizeCustomsAgingBatch,
  generateConvexCustomsAgingSchema,
  persistCustomsAgingRecord,
  getCustomsAgingRecords,
  clearCustomsAgingStoreForTesting,
  type InternationalShipment,
} from "../src/lib/customs-clearance-aging.ts";

describe("Buyer Shipping Resolution Unit Tests", () => {
  it("resolves valid US shipping address", () => {
    const res = resolveBuyerShippingAddress({
      shippingName: "Jane Doe",
      shippingAddress1: "100 Main St",
      shippingCity: "Austin",
      shippingState: "TX",
      shippingZip: "78701",
      shippingCountry: "US",
    });
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.address.name, "Jane Doe");
      assert.equal(res.address.countryCode, "US");
    }
  });

  it("handles missing required fields", () => {
    const res = resolveBuyerShippingAddress({});
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.ok(res.missing.length > 0);
    }
  });

  it("describes missing buyer shipping fields", () => {
    const msg = describeMissingBuyerShipping(["shippingZip", "shippingState"]);
    assert.ok(msg.includes("shippingZip"));
  });

  it("extracts stripe shipping metadata", () => {
    const meta = extractStripeShippingMetadata({
      receipt_email: "buyer@example.com",
      shipping: {
        name: "John Smith",
        address: {
          line1: "456 Oak Ave",
          city: "London",
          postal_code: "EC1A 1BB",
          country: "GB",
        },
      },
    });
    assert.equal(meta.buyerEmail, "buyer@example.com");
    assert.equal(meta.shippingName, "John Smith");
  });

  it("returns collection countries for US region", () => {
    const countries = shippingAddressCollectionCountries("US");
    assert.deepEqual(countries, ["US"]);
  });
});

describe("Customs Clearance Aging Unit Tests", () => {
  const sampleShipment: InternationalShipment = {
    shipmentId: "ship_123",
    orderId: "ord_456",
    originCountry: "US",
    destinationCountry: "GB",
    carrier: "dhl_express",
    shippedAtIso: "2026-08-01T10:00:00Z",
    expectedDeliverySlaDays: 5,
    declaredValueUsd: 200,
    hsTariffCode: "4911.91",
    commercialInvoiceAttached: true,
    recipientEoriOrVatProvided: true,
    currentStatus: "in_transit",
    lastScanTimestampIso: "2026-08-02T10:00:00Z",
    daysInCustoms: 0,
  };

  it("predicts customs clearance aging for on-track shipment", () => {
    const pred = predictCustomsClearanceAging(sampleShipment, "2026-08-03T10:00:00Z");
    assert.equal(pred.shipmentId, "ship_123");
    assert.equal(pred.daysInTransit, 2);
    assert.equal(pred.agingStatus, "on_track");
  });

  it("summarizes customs aging batch", () => {
    const summary = summarizeCustomsAgingBatch([sampleShipment], "2026-08-03T10:00:00Z");
    assert.equal(summary.totalShipmentsMonitored, 1);
    assert.equal(summary.onTrackCount, 1);
  });

  it("generates convex schema and persists records", () => {
    clearCustomsAgingStoreForTesting();
    const schema = generateConvexCustomsAgingSchema();
    assert.equal(schema.tableName, "customs_clearance_aging");

    const pred = predictCustomsClearanceAging(sampleShipment, "2026-08-03T10:00:00Z");
    const record = persistCustomsAgingRecord(pred);
    assert.equal(record.shipmentId, "ship_123");
    assert.equal(getCustomsAgingRecords().length, 1);
  });
});
