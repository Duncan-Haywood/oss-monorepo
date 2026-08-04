import assert from "node:assert/strict";
import { test } from "node:test";

import { parseArtistOnboardingDeepLinkParams } from "../src/lib/artist-onboarding.ts";
import {
  buildArtistOnboardingDeepLink,
  buildOutreachQueue,
  isOnboardingDeepLinkEligible,
  outreachProspects,
} from "../src/lib/outreach.ts";

test("buildArtistOnboardingDeepLink encodes outreach handle and name", () => {
  const link = buildArtistOnboardingDeepLink({
    name: "Elena Rostova",
    handle: "@elena_paints",
  });

  assert.ok(link.includes("/artist-onboard?"));
  assert.ok(link.includes("handle=elena_paints"));
  assert.ok(link.includes("name=Elena"));
  assert.ok(link.includes("source=outreach"));
});

test("parseArtistOnboardingDeepLinkParams normalizes handle and source", () => {
  const parsed = parseArtistOnboardingDeepLinkParams({
    handle: "marcus.art",
    name: "Marcus Chen",
    source: "outreach",
  });

  assert.equal(parsed.handle, "@marcus.art");
  assert.equal(parsed.name, "Marcus Chen");
  assert.equal(parsed.source, "outreach");
});

test("isOnboardingDeepLinkEligible allows upload-ready replies without guardrails", () => {
  const queue = buildOutreachQueue(outreachProspects);
  const elena = queue.find((item) => item.handle === "@elena_paints");

  assert.ok(elena);
  assert.equal(isOnboardingDeepLinkEligible(elena!), true);
});
