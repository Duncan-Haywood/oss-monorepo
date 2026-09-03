import test from "node:test";
import assert from "node:assert/strict";

import { loadQuote } from "./calc.mjs";
import { serializeDraft, parseDraft } from "./drafts.mjs";

const quote = loadQuote({ currency: "USD", price: 2400, delivery_hours: 24, admin_hours: 5, revision_hours: 6, overhead: 180, subcontractor_cost: 300, target_hourly_rate: 75 });

test("round trips only the validated quote inputs", () => {
  const restored = parseDraft(serializeDraft(quote), loadQuote);
  assert.deepEqual(restored, quote);
});

test("rejects malformed, unsupported, and invalid drafts", () => {
  assert.throws(() => parseDraft("not json", loadQuote), /valid JSON/);
  assert.throws(() => parseDraft(JSON.stringify({ version: 2, quote }), loadQuote), /supported/);
  assert.throws(() => parseDraft(JSON.stringify({ version: 1, quote: [] }), loadQuote), /supported/);
  assert.throws(() => parseDraft(JSON.stringify({ version: 1, quote: { ...quote, price: -1 } }), loadQuote), /non-negative/);
});

test("rejects oversized draft files before parsing", () => {
  assert.throws(() => parseDraft("x".repeat(32 * 1024 + 1), loadQuote), /too large/);
});
