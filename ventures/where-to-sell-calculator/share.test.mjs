import assert from "node:assert/strict";
import { test } from "node:test";
import { CHANNEL_PRESETS, compareChannels } from "./calc.mjs";
import { decodeComparison, encodeComparison } from "./share.mjs";

test("round-trips shared inputs and channel overrides", () => {
  const shared = {
    price: "48", itemCost: "14", monthlyOrders: "100", daysToSell: "12",
    includeSubscription: false, includeReturns: false,
  };
  const channels = CHANNEL_PRESETS.map((channel) => ({
    ...channel,
    price: channel.id === "etsy" ? "62" : undefined,
    daysToSell: channel.id === "ebay" ? "9" : channel.daysToSell,
    returnRate: channel.id === "amazon" ? "22" : undefined,
  }));
  const restored = decodeComparison(encodeComparison(shared, channels));
  assert.deepEqual(restored.shared, { price: 48, itemCost: 14, monthlyOrders: 100, daysToSell: 12 });
  assert.equal(restored.includeSubscription, false);
  assert.equal(restored.includeReturns, false);
  // Values arrive coerced to numbers: the form hands over strings, the link
  // carries them, and the recipient gets something the calculator can use.
  assert.equal(restored.channels.find((channel) => channel.id === "etsy").price, 62);
  assert.equal(restored.channels.find((channel) => channel.id === "ebay").daysToSell, 9);
  assert.equal(restored.channels.find((channel) => channel.id === "amazon").returnRate, 22);
  assert.equal(restored.channels.find((channel) => channel.id === "other").enabled, false);
});

test("a shared link reproduces the sender's comparison exactly", () => {
  // A field the allowlists forget is dropped in silence, and the recipient
  // then reads a different answer than the sender saw with no error anywhere.
  // Comparing the whole computed result — not just the fields we remembered to
  // assert — is what catches the next field added to calc.mjs.
  const shared = {
    price: 48, shippingCharged: 6, shippingCost: 5, itemCost: 14,
    packagingCost: 1, otherCost: 0, monthlyOrders: 40,
    horizonDays: 120, capitalCostPct: 18, unsoldRecoveryPct: 70,
  };
  const channels = CHANNEL_PRESETS.map((channel) => ({
    ...channel,
    sellThroughPct: channel.id === "etsy" ? 25 : channel.sellThroughPct,
    daysToSell: channel.id === "etsy" ? 70 : channel.daysToSell,
  }));

  const restored = decodeComparison(encodeComparison(shared, channels));
  const rebuilt = CHANNEL_PRESETS.map((preset) => {
    const incoming = restored.channels.find((candidate) => candidate.id === preset.id);
    return incoming ? { ...preset, ...incoming } : preset;
  });

  const sent = compareChannels(channels, shared);
  const received = compareChannels(rebuilt, { ...restored.shared, includeReturns: restored.includeReturns });
  assert.deepEqual(received.ranked, sent.ranked, "the ranking travelled");
  assert.deepEqual(received.shelf.ranked, sent.shelf.ranked, "the shelf-time ranking travelled");
  for (const before of sent.results) {
    const after = received.results.find((result) => result.id === before.id);
    assert.equal(after.expectedProfit, before.expectedProfit, `${before.label} expected keep`);
    assert.equal(
      after.velocity.valuePer30Days,
      before.velocity.valuePer30Days,
      `${before.label} value per 30 days of shelf`,
    );
  }
});

test("ignores unknown fields and malformed links", () => {
  const restored = decodeComparison(encodeURIComponent(JSON.stringify({
    shared: { price: 10, secret: "do not copy", itemCost: -2 },
    channels: [{ id: "ebay", values: { commissionRate: 13, secret: "no" } }],
  })));
  assert.deepEqual(restored.shared, { price: 10 });
  assert.deepEqual(restored.channels[0], { id: "ebay", enabled: true, commissionRate: 13 });
  assert.equal(decodeComparison("not-json"), null);
});

test("a channel value that is not a usable number is dropped, not passed on", () => {
  // Salvaged from cursor/where-to-sell-share-hardening-20260825. A link is
  // untrusted input: a non-numeric or negative value used to survive the
  // filter and reach calculateChannel, where the recipient saw a validation
  // error naming a field they never typed. Falling back to the preset is the
  // behaviour a bad link should have.
  const restored = decodeComparison(encodeURIComponent(JSON.stringify({
    channels: [{
      id: "etsy",
      values: { commissionRate: "abc", sellThroughPct: -5, daysToSell: "45", listingRenewalDays: 0 },
    }],
  })));
  assert.deepEqual(restored.channels[0], {
    id: "etsy",
    enabled: true,
    daysToSell: 45,
    listingRenewalDays: 0,
  });
});

test("a link cannot smuggle a channel field the calculator never asked for", () => {
  // The other half of cursor/where-to-sell-share-hardening-20260825, and the
  // half `main` did not carry: the decoder rebuilds each channel from `id`,
  // `enabled` and the CHANNEL_FIELDS allowlist rather than spreading whatever
  // the link contained. `label` is the field that matters — the page renders it
  // as the channel's name, so a link that could set it would be markup
  // injection through a URL a seller was told was safe to share.
  const restored = decodeComparison(encodeURIComponent(JSON.stringify({
    channels: [{
      id: "etsy",
      enabled: true,
      label: "<img src=x onerror=alert(1)>",
      values: { price: "62", commissionRate: "not a number", paymentRate: "<input>", monthlyFee: -1 },
    }],
  })));
  assert.deepEqual(restored.channels, [{ id: "etsy", enabled: true, price: 62 }]);
});
