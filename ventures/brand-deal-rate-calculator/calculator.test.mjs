import test from "node:test";
import assert from "node:assert/strict";

import { computeRates, DELIVERABLES, PLATFORMS } from "./calculator.mjs";

function findingIds(result) {
  return result.findings.map((f) => f.id);
}

test("zero followers or zero engagement rate produces zero prices and a missing-input finding", () => {
  const result = computeRates({ followers: 0, engagementRate: 4, platform: "instagram" });
  assert.ok(findingIds(result).includes("missing-input"));
  for (const deliverable of DELIVERABLES) {
    assert.equal(result.rates[deliverable].low, 0);
    assert.equal(result.rates[deliverable].high, 0);
  }
});

test("a mid-size instagram account produces a sensible price range for a post", () => {
  const result = computeRates({ followers: 50000, engagementRate: 4, platform: "instagram" });
  // engagedFollowers = 2000, perThousandEngaged = 2
  assert.equal(result.engagedFollowers, 2000);
  assert.equal(result.rates.post.low, 20); // 2 * 10
  assert.equal(result.rates.post.high, 40); // 2 * 20
  assert.ok(result.rates.post.low < result.rates.post.high);
});

test("dedicated video always prices higher than post, which prices higher than story", () => {
  const result = computeRates({ followers: 80000, engagementRate: 5, platform: "youtube" });
  assert.ok(result.rates.video.low > result.rates.post.low);
  assert.ok(result.rates.post.low > result.rates.story.low);
});

test("youtube prices a dedicated video higher than instagram for the same audience", () => {
  const input = { followers: 60000, engagementRate: 5 };
  const instagram = computeRates({ ...input, platform: "instagram" });
  const youtube = computeRates({ ...input, platform: "youtube" });
  assert.ok(youtube.rates.video.low > instagram.rates.video.low);
  assert.ok(youtube.rates.video.high > instagram.rates.video.high);
});

test("an unrecognized platform falls back to general", () => {
  const a = computeRates({ followers: 30000, engagementRate: 3, platform: "not-a-real-platform" });
  const b = computeRates({ followers: 30000, engagementRate: 3, platform: "general" });
  assert.deepEqual(a.rates, b.rates);
});

test("engagement rate above 100 is clamped to 100", () => {
  const clamped = computeRates({ followers: 20000, engagementRate: 250, platform: "instagram" });
  const full = computeRates({ followers: 20000, engagementRate: 100, platform: "instagram" });
  assert.deepEqual(clamped.rates, full.rates);
});

test("negative or non-numeric input does not throw and yields zero engaged followers", () => {
  assert.doesNotThrow(() => computeRates({ followers: -50, engagementRate: 4, platform: "instagram" }));
  assert.doesNotThrow(() => computeRates({ followers: NaN, engagementRate: 4, platform: "instagram" }));
  assert.doesNotThrow(() => computeRates({ followers: undefined, engagementRate: undefined, platform: undefined }));
  const result = computeRates({ followers: -50, engagementRate: 4, platform: "instagram" });
  assert.equal(result.engagedFollowers, 0);
});

test("an account under 1,000 followers is flagged", () => {
  const result = computeRates({ followers: 500, engagementRate: 4, platform: "instagram" });
  assert.ok(findingIds(result).includes("low-follower-count"));
});

test("an account at or above 1,000 followers is not flagged for size", () => {
  const result = computeRates({ followers: 1000, engagementRate: 4, platform: "instagram" });
  assert.ok(!findingIds(result).includes("low-follower-count"));
});

test("an engagement rate below 1% is flagged", () => {
  const result = computeRates({ followers: 50000, engagementRate: 0.5, platform: "instagram" });
  assert.ok(findingIds(result).includes("low-engagement-rate"));
});

test("an engagement rate above 15% is flagged as unusually high, not as a problem", () => {
  const result = computeRates({ followers: 50000, engagementRate: 20, platform: "instagram" });
  assert.ok(findingIds(result).includes("high-engagement-rate"));
  const finding = result.findings.find((f) => f.id === "high-engagement-rate");
  assert.equal(finding.severity, "info");
});

test("a typical engagement rate between 1% and 15% is not flagged either way", () => {
  const result = computeRates({ followers: 50000, engagementRate: 4, platform: "instagram" });
  assert.ok(!findingIds(result).includes("low-engagement-rate"));
  assert.ok(!findingIds(result).includes("high-engagement-rate"));
});

test("every deliverable and platform combination returns a low <= high range", () => {
  for (const platform of PLATFORMS) {
    for (const deliverable of DELIVERABLES) {
      const result = computeRates({ followers: 40000, engagementRate: 3.5, platform });
      assert.ok(result.rates[deliverable].low <= result.rates[deliverable].high, `${platform}/${deliverable}`);
    }
  }
});
