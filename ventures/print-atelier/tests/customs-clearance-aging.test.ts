import assert from "node:assert/strict";
import test from "node:test";
import {
  predictCustomsClearanceAging,
  summarizeCustomsAgingBatch,
  generateConvexCustomsAgingSchema,
  persistCustomsAgingRecord,
  getCustomsAgingRecords,
  clearCustomsAgingStoreForTesting,
  type InternationalShipment,
} from "../src/lib/customs-clearance-aging";

test("predicts on-track status for compliant shipment", () => {
  const shipment: InternationalShipment = {
    shipmentId: "ship_001",
    orderId: "ord_101",
    originCountry: "US",
    destinationCountry: "CA",
    carrier: "dhl_express",
    shippedAtIso: "2026-08-01T10:00:00Z",
    expectedDeliverySlaDays: 5,
    declaredValueUsd: 150,
    hsTariffCode: "4911.91",
    commercialInvoiceAttached: true,
    currentStatus: "in_transit",
    lastScanTimestampIso: "2026-08-01T18:00:00Z",
    daysInCustoms: 0,
  };

  const pred = predictCustomsClearanceAging(shipment, "2026-08-02T10:00:00Z");
  assert.equal(pred.agingStatus, "on_track");
  assert.equal(pred.customsRiskLevel, "low");
});

test("flags critical risk and customs_hold status for missing invoice and customs hold status", () => {
  const shipment: InternationalShipment = {
    shipmentId: "ship_002",
    orderId: "ord_102",
    originCountry: "US",
    destinationCountry: "DE",
    carrier: "fedex_priority",
    shippedAtIso: "2026-07-28T10:00:00Z",
    expectedDeliverySlaDays: 3,
    declaredValueUsd: 3000,
    commercialInvoiceAttached: false,
    currentStatus: "customs_hold",
    lastScanTimestampIso: "2026-07-30T12:00:00Z",
    daysInCustoms: 3,
  };

  const pred = predictCustomsClearanceAging(shipment, "2026-08-02T10:00:00Z");
  assert.equal(pred.agingStatus, "customs_hold_action_required");
  assert.equal(pred.customsRiskLevel, "critical");
  assert.equal(pred.requiresUrgentCustomerContact, true);
});

test("summarizes batch aging metrics correctly", () => {
  const shipments: InternationalShipment[] = [
    {
      shipmentId: "s1",
      orderId: "o1",
      originCountry: "US",
      destinationCountry: "CA",
      carrier: "dhl_express",
      shippedAtIso: "2026-08-01T12:00:00Z",
      expectedDeliverySlaDays: 5,
      declaredValueUsd: 100,
      hsTariffCode: "4911.91",
      commercialInvoiceAttached: true,
      currentStatus: "in_transit",
      lastScanTimestampIso: "2026-08-02T08:00:00Z",
      daysInCustoms: 0,
    },
    {
      shipmentId: "s2",
      orderId: "o2",
      originCountry: "US",
      destinationCountry: "GB",
      carrier: "fedex_priority",
      shippedAtIso: "2026-07-28T12:00:00Z",
      expectedDeliverySlaDays: 3,
      declaredValueUsd: 3000,
      commercialInvoiceAttached: false,
      currentStatus: "customs_hold",
      lastScanTimestampIso: "2026-07-29T12:00:00Z",
      daysInCustoms: 2,
    },
  ];

  const summary = summarizeCustomsAgingBatch(shipments, "2026-08-02T12:00:00Z");
  assert.equal(summary.totalShipmentsMonitored, 2);
  assert.equal(summary.highRiskShipmentIds.length, 1);
});

test("generates Convex schema and persists aging record", () => {
  clearCustomsAgingStoreForTesting();
  const schema = generateConvexCustomsAgingSchema();
  assert.equal(schema.tableName, "customs_clearance_aging");

  const shipment: InternationalShipment = {
    shipmentId: "s1",
    orderId: "o1",
    originCountry: "US",
    destinationCountry: "CA",
    carrier: "dhl_express",
    shippedAtIso: "2026-08-01T12:00:00Z",
    expectedDeliverySlaDays: 5,
    declaredValueUsd: 100,
    hsTariffCode: "4911.91",
    commercialInvoiceAttached: true,
    currentStatus: "in_transit",
    lastScanTimestampIso: "2026-08-02T08:00:00Z",
    daysInCustoms: 0,
  };

  const pred = predictCustomsClearanceAging(shipment);
  const rec = persistCustomsAgingRecord(pred);
  assert.equal(rec.shipmentId, "s1");
  assert.equal(getCustomsAgingRecords().length, 1);
});
