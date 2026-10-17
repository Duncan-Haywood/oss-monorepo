import test from "node:test";
import assert from "node:assert/strict";
import {
  providerMonthlyCost,
  compareProviders,
  cachedInputShare,
  cacheSavings,
  decisionSummary,
} from "./calc.mjs";

test("providerMonthlyCost prices each token class at its own rate and sums them", () => {
  const result = providerMonthlyCost({
    name: "Test Provider",
    freshInputTokens: 5_000_000,
    cachedInputTokens: 45_000_000,
    outputTokens: 2_000_000,
    inputRate: 3,
    cachedInputRate: 0.3,
    outputRate: 15,
  });
  assert.ok(Math.abs(result.inputCost - 15) < 1e-9); // 5M/1M * $3
  assert.ok(Math.abs(result.cachedInputCost - 13.5) < 1e-9); // 45M/1M * $0.30
  assert.ok(Math.abs(result.outputCost - 30) < 1e-9); // 2M/1M * $15
  assert.ok(Math.abs(result.total - 58.5) < 1e-9);
});

test("providerMonthlyCost defaults an unnamed provider's label", () => {
  const result = providerMonthlyCost({
    freshInputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    inputRate: 1,
    cachedInputRate: 1,
    outputRate: 1,
  });
  assert.equal(result.name, "Provider");
});

test("providerMonthlyCost is zero when the whole workload is zero volume", () => {
  const result = providerMonthlyCost({
    name: "Idle",
    freshInputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    inputRate: 3,
    cachedInputRate: 0.3,
    outputRate: 15,
  });
  assert.equal(result.total, 0);
});

test("providerMonthlyCost rejects negative token counts", () => {
  const base = {
    name: "P",
    freshInputTokens: 1,
    cachedInputTokens: 1,
    outputTokens: 1,
    inputRate: 1,
    cachedInputRate: 1,
    outputRate: 1,
  };
  assert.throws(() => providerMonthlyCost({ ...base, freshInputTokens: -1 }), /Fresh input tokens/);
  assert.throws(() => providerMonthlyCost({ ...base, cachedInputTokens: -1 }), /Cached input tokens/);
  assert.throws(() => providerMonthlyCost({ ...base, outputTokens: -1 }), /Output tokens/);
});

test("providerMonthlyCost rejects negative rates and a missing (non-numeric) rate", () => {
  const base = {
    name: "P",
    freshInputTokens: 1,
    cachedInputTokens: 1,
    outputTokens: 1,
    inputRate: 1,
    cachedInputRate: 1,
    outputRate: 1,
  };
  assert.throws(() => providerMonthlyCost({ ...base, inputRate: -1 }), /input rate/);
  assert.throws(() => providerMonthlyCost({ ...base, cachedInputRate: -1 }), /cached-input rate/);
  assert.throws(() => providerMonthlyCost({ ...base, outputRate: -1 }), /output rate/);
  // A non-numeric rate field (e.g. "abc" parsed with unary +) becomes NaN --
  // a missing/garbled rate must be a visible error, never a silent free row.
  assert.throws(() => providerMonthlyCost({ ...base, inputRate: Number("abc") }), /input rate/);
});

test("compareProviders ranks by total ascending and names the cheapest", () => {
  const providers = [
    { name: "Pricier", freshInputTokens: 1_000_000, cachedInputTokens: 0, outputTokens: 100_000, inputRate: 5, cachedInputRate: 0.5, outputRate: 20 },
    { name: "Cheaper", freshInputTokens: 1_000_000, cachedInputTokens: 0, outputTokens: 100_000, inputRate: 1, cachedInputRate: 0.1, outputRate: 5 },
  ];
  const { ranked, cheapestName, spread } = compareProviders(providers);
  assert.equal(ranked[0].name, "Cheaper");
  assert.equal(ranked[1].name, "Pricier");
  assert.equal(cheapestName, "Cheaper");
  assert.ok(spread > 0);
});

test("compareProviders reports zero spread when every provider totals the same", () => {
  const providers = [
    { name: "A", freshInputTokens: 1_000_000, cachedInputTokens: 0, outputTokens: 0, inputRate: 2, cachedInputRate: 1, outputRate: 1 },
    { name: "B", freshInputTokens: 1_000_000, cachedInputTokens: 0, outputTokens: 0, inputRate: 2, cachedInputRate: 1, outputRate: 1 },
  ];
  const { spread } = compareProviders(providers);
  assert.equal(spread, 0);
});

test("compareProviders requires at least one provider", () => {
  assert.throws(() => compareProviders([]), /At least one provider/);
  assert.throws(() => compareProviders(undefined), /At least one provider/);
});

test("cachedInputShare is the cached fraction of total input tokens", () => {
  assert.ok(Math.abs(cachedInputShare({ freshInputTokens: 5_000_000, cachedInputTokens: 45_000_000 }) - 0.9) < 1e-9);
  assert.equal(cachedInputShare({ freshInputTokens: 1, cachedInputTokens: 0 }), 0);
  assert.equal(cachedInputShare({ freshInputTokens: 0, cachedInputTokens: 1 }), 1);
});

test("cachedInputShare is null when there is no input volume at all", () => {
  assert.equal(cachedInputShare({ freshInputTokens: 0, cachedInputTokens: 0 }), null);
});

test("cacheSavings is the gap between billing cached tokens at the fresh rate vs. the cached rate", () => {
  const savings = cacheSavings({ cachedInputTokens: 45_000_000, inputRate: 3, cachedInputRate: 0.3 });
  assert.ok(Math.abs(savings - (135 - 13.5)) < 1e-9);
});

test("cacheSavings is zero or negative when the entered cached rate is not actually cheaper", () => {
  assert.equal(cacheSavings({ cachedInputTokens: 1_000_000, inputRate: 2, cachedInputRate: 2 }), 0);
  assert.ok(cacheSavings({ cachedInputTokens: 1_000_000, inputRate: 2, cachedInputRate: 3 }) < 0);
});

test("decisionSummary lists every provider cheapest-first, states the cached share, and states it is an estimate", () => {
  const summary = decisionSummary({
    freshInputTokens: 5_000_000,
    cachedInputTokens: 45_000_000,
    outputTokens: 2_000_000,
    providers: [
      { name: "A", freshInputTokens: 5_000_000, cachedInputTokens: 45_000_000, outputTokens: 2_000_000, inputRate: 3, cachedInputRate: 0.3, outputRate: 15 },
      { name: "B", freshInputTokens: 5_000_000, cachedInputTokens: 45_000_000, outputTokens: 2_000_000, inputRate: 1, cachedInputRate: 0.1, outputRate: 5 },
    ],
  });
  const bIndex = summary.indexOf("B:");
  const aIndex = summary.indexOf("A:");
  assert.ok(bIndex > -1 && aIndex > -1 && bIndex < aIndex, "cheaper provider B should be listed before A");
  assert.match(summary, /Cached share of input tokens: 90\.0%/);
  assert.match(summary, /Estimate only/);
});

test("decisionSummary omits the cached-share line when there is no input volume", () => {
  const summary = decisionSummary({
    freshInputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 1_000_000,
    providers: [
      { name: "A", freshInputTokens: 0, cachedInputTokens: 0, outputTokens: 1_000_000, inputRate: 1, cachedInputRate: 1, outputRate: 5 },
    ],
  });
  assert.doesNotMatch(summary, /Cached share/);
});
