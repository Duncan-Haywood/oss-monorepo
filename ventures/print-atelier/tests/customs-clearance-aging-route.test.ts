import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { POST } from "../src/app/api/ops/customs-clearance-aging/route";
import { OPS_TOKEN_ENV } from "../src/lib/api-auth";

describe("customs-clearance-aging route API", () => {
  const TEST_TOKEN = "customs-test-token-789";
  let savedToken: string | undefined;

  beforeEach(() => {
    savedToken = process.env[OPS_TOKEN_ENV];
    process.env[OPS_TOKEN_ENV] = TEST_TOKEN;
  });

  afterEach(() => {
    if (savedToken === undefined) {
      delete process.env[OPS_TOKEN_ENV];
    } else {
      process.env[OPS_TOKEN_ENV] = savedToken;
    }
  });

  const sampleShipment = {
    shipmentId: "shp_2001",
    orderId: "ord_6001",
    originCountry: "US",
    destinationCountry: "GB",
    carrier: "dhl_express",
    shippedAtIso: new Date().toISOString(),
    expectedDeliverySlaDays: 5,
    declaredValueUsd: 200.0,
    hsTariffCode: "4911.91",
    commercialInvoiceAttached: true,
    recipientEoriOrVatProvided: true,
    currentStatus: "in_transit",
    lastScanTimestampIso: new Date().toISOString(),
    daysInCustoms: 0,
  };

  it("handles single shipment risk prediction via POST", async () => {
    const req = new Request("http://localhost/api/ops/customs-clearance-aging", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({ shipment: sampleShipment }),
    });

    const res = await POST(req);
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.prediction.shipmentId, "shp_2001");
    assert.ok(data.persistedRecordId);
  });

  it("handles batch shipments summary via POST", async () => {
    const req = new Request("http://localhost/api/ops/customs-clearance-aging", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({ shipments: [sampleShipment] }),
    });

    const res = await POST(req);
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.summary.totalShipmentsMonitored, 1);
  });

  it("returns 400 when body is missing shipment payload", async () => {
    const req = new Request("http://localhost/api/ops/customs-clearance-aging", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    assert.equal(res.status, 400);

    const data = await res.json();
    assert.equal(data.error, "Missing shipment or shipments data");
  });
});
