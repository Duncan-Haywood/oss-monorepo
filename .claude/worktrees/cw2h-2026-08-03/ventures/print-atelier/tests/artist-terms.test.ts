import assert from "node:assert/strict";
import test from "node:test";

import {
  artistObjectionTemplates,
  buildArtistTermsExplainer,
  findObjectionTemplateByQuery,
  getAllChannelTermsPreviews,
  getArtistObjectionTemplates,
  getChannelTermsPreview,
} from "../src/lib/artist-terms.ts";

test("provides complete structured objection templates for artist inquiries", () => {
  const templates = getArtistObjectionTemplates();
  assert.ok(templates.length >= 5);

  for (const template of templates) {
    assert.ok(template.id);
    assert.ok(template.category);
    assert.ok(template.artistObjection);
    assert.ok(template.legalClause.includes("Clause"));
    assert.ok(template.responseCopy);
    assert.ok(template.channelCopySnippet);
    assert.ok(template.suggestedAction);
  }
});

test("finds appropriate objection template by query keywords", () => {
  const copyrightMatch = findObjectionTemplateByQuery("Do I keep the copyright of my art?");
  assert.equal(copyrightMatch.id, "copyright-retention");
  assert.equal(copyrightMatch.category, "Copyright & Ownership");

  const nonExclusiveMatch = findObjectionTemplateByQuery("Can I still sell prints on my Etsy shop?");
  assert.equal(nonExclusiveMatch.id, "non-exclusive-pod");

  const benchmarkMatch = findObjectionTemplateByQuery("Why is 30% net better than Society6 10% royalty?");
  assert.equal(benchmarkMatch.id, "payout-vs-royalty-benchmark");

  const aiRoomMatch = findObjectionTemplateByQuery("How do you render AI room mockups for ads?");
  assert.equal(aiRoomMatch.id, "ai-room-scene-rights");

  const cancelMatch = findObjectionTemplateByQuery("Can I delete my listings and cancel anytime?");
  assert.equal(cancelMatch.id, "cancel-remove-anytime");
});

test("builds detailed artist terms explainer with payout math example", () => {
  const explainer = buildArtistTermsExplainer({ retailPrice: 120 });
  assert.ok(explainer.version.includes("2026."));
  assert.ok(explainer.copyrightRetention.keyPoints.length > 0);
  assert.ok(explainer.podLicense.fulfillmentPartners.includes("Printful Inc."));
  assert.equal(explainer.payoutMathAndAcknowledgement.examplePayout.retailPrice, 120);
  assert.ok(explainer.payoutMathAndAcknowledgement.examplePayout.artistPayout > 20);
  assert.ok(explainer.summaryLabel.includes("100% Copyright Retention"));
});

test("returns channel-specific legal terms previews for all channels", () => {
  const previews = getAllChannelTermsPreviews();
  assert.equal(previews.length, 4);

  const storefront = getChannelTermsPreview("storefront");
  assert.equal(storefront.channel, "storefront");
  assert.ok(storefront.shortNotice.includes("30% net profit"));
  assert.equal(storefront.requiredConsentGate, "pod_fulfillment");

  const outreach = getChannelTermsPreview("outreach");
  assert.equal(outreach.channel, "outreach");
  assert.ok(outreach.fullTermsSnippet.includes("non-exclusive"));

  const paidAds = getChannelTermsPreview("paid-ads");
  assert.equal(paidAds.requiredConsentGate, "paid_ads");

  const aiRoom = getChannelTermsPreview("ai-room-scenes");
  assert.equal(aiRoom.requiredConsentGate, "ai_room_preview");
});

