import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { POST as batchTransferPost } from "../src/app/api/payouts/batch-transfer/route";
import { OPS_TOKEN_ENV } from "../src/lib/api-auth";
import { executeConnectPayoutBatchTransfer } from "../src/lib/stripe-connect";
import { buildArtistPayoutReconciliation } from "../src/lib/payout-reconciliation";

const TOKEN = "s3cr3t-operator-token";
const AUTHORIZED = { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved[OPS_TOKEN_ENV] = process.env[OPS_TOKEN_ENV];
  process.env[OPS_TOKEN_ENV] = TOKEN;
});

afterEach(() => {
  if (saved[OPS_TOKEN_ENV] === undefined) {
    delete process.env[OPS_TOKEN_ENV];
  } else {
    process.env[OPS_TOKEN_ENV] = saved[OPS_TOKEN_ENV];
  }
});

function postRequest(path: string, body: Record<string, unknown> = {}, headers: Record<string, string> = {}): Request {
  return new Request(`https://printatelier.com${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

test("executeConnectPayoutBatchTransfer prepares top-up transfer instructions for underpaid accounts", () => {
  const report = buildArtistPayoutReconciliation({
    expectations: [
      {
        artistAccountId: "acct_artist_1",
        artistHandle: "@artist1",
        orderId: "ord_100",
        expectedPayoutCents: 5000,
        currency: "USD",
        recordedAt: "2026-08-01T12:00:00Z",
      },
    ],
    payoutEvents: [
      {
        dbId: "db_evt_1",
        eventId: "evt_1",
        eventType: "transfer.created",
        artistAccountId: "acct_artist_1",
        amountCents: 3000,
        currency: "USD",
        status: "settled",
        convexSyncedAt: "2026-08-01T12:05:00Z",
        updatedAt: "2026-08-01T12:05:00Z",
        testMode: true,
        recordedAt: "2026-08-01T12:05:00Z",
      },
    ],
  });

  const result = executeConnectPayoutBatchTransfer({
    report,
    minTransferCents: 100,
    maxTransferCents: 100000,
    testMode: true,
    now: "2026-08-02T10:00:00Z",
  });

  assert.equal(result.totalTransfers, 1);
  assert.equal(result.totalTopUpCents, 2000);
  assert.equal(result.instructions[0].artistAccountId, "acct_artist_1");
  assert.equal(result.instructions[0].amountCents, 2000);
  assert.match(result.summaryLabel, /Prepared 1 batch top-up transfer/);
});

test("executeConnectPayoutBatchTransfer skips accounts below min threshold", () => {
  const report = buildArtistPayoutReconciliation({
    expectations: [
      {
        artistAccountId: "acct_artist_2",
        artistHandle: "@artist2",
        orderId: "ord_101",
        expectedPayoutCents: 5000,
        currency: "USD",
        recordedAt: "2026-08-01T12:00:00Z",
      },
    ],
    payoutEvents: [
      {
        dbId: "db_evt_2",
        eventId: "evt_2",
        eventType: "transfer.created",
        artistAccountId: "acct_artist_2",
        amountCents: 4950,
        currency: "USD",
        status: "settled",
        convexSyncedAt: "2026-08-01T12:05:00Z",
        updatedAt: "2026-08-01T12:05:00Z",
        testMode: true,
        recordedAt: "2026-08-01T12:05:00Z",
      },
    ],
  });

  const result = executeConnectPayoutBatchTransfer({
    report,
    minTransferCents: 100,
    now: "2026-08-02T10:00:00Z",
  });

  assert.equal(result.totalTransfers, 0);
  assert.equal(result.skippedAccounts.length, 1);
  assert.match(result.skippedAccounts[0].reason, /below minimum batch transfer threshold/);
});

test("POST /api/payouts/batch-transfer refuses unauthenticated caller", async () => {
  const response = await batchTransferPost(postRequest("/api/payouts/batch-transfer"));
  assert.equal(response.status, 401);
});

test("POST /api/payouts/batch-transfer succeeds for authenticated operator", async () => {
  const response = await batchTransferPost(postRequest("/api/payouts/batch-transfer", {}, AUTHORIZED));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.success, true);
  assert.ok(data.result);
  assert.ok(data.diagnostics);
});
