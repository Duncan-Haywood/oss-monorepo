import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProofMockupKitsForQueue,
  buildProofMockupResponseKit,
  outreachProspects,
} from "../src/lib/outreach.ts";

test("buildProofMockupResponseKit assembles room scenes and payout proof for mockup requests", () => {
  const marcus = outreachProspects.find((prospect) => prospect.handle === "@marcus.art");
  assert.ok(marcus);

  const kit = buildProofMockupResponseKit(marcus!);

  assert.equal(kit.artworkSlug, "urban-geometry");
  assert.equal(kit.roomScenes.length, 3);
  assert.ok(kit.payoutProof);
  assert.ok(kit.payoutProof!.artistPayoutPerOrder > 0);
  assert.equal(kit.readyToSend, true);
  assert.ok(kit.dmCopy.includes("room scenes"));
  assert.ok(kit.emailCopy.includes("30% of net profit"));
  assert.equal(kit.attachmentLabels.length, 5);
});

test("buildProofMockupResponseKit blocks send when artwork lacks approved mockups", () => {
  const kit = buildProofMockupResponseKit({
    name: "Alex Jenkins",
    handle: "@abstractalex",
    platform: "Instagram",
    followers: 5200,
    status: "Replied",
    fitScore: 88,
    styleSignal: "Abstract print blocked on proof",
    replyText: "Can you send room mockup examples?",
    projectedMonthlyArtistPayout: 0,
    catalogArtworkSlug: "abstract-no-4",
  });

  assert.equal(kit.readyToSend, false);
  assert.ok(kit.blockers.some((blocker) => blocker.includes("approved print proof")));
});

test("buildProofMockupKitsForQueue returns kits only for mockup-classified replies", () => {
  const kits = buildProofMockupKitsForQueue();

  assert.equal(kits.length, 1);
  assert.equal(kits[0]?.prospectHandle, "@marcus.art");
});
