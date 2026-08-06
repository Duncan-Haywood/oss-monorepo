import assert from "node:assert/strict";
import test from "node:test";
import { catalogArtworks } from "../src/lib/marketplace.ts";
import {
  buildSitemapEntries,
  buildSitemapXml,
  evaluateSeoPagePublishability,
  formatSeoVolume,
  generateSeoLandingPages,
  getPublishableSeoSlugs,
  getSeoIntentLabel,
  getSeoPageBySlug,
  UNSELLABLE_BLOCKER_PREFIX,
} from "../src/lib/seo.ts";
import { buildListingConsentGate, defaultListingConsentRecords } from "../src/lib/marketplace.ts";
import { buildAdCatalogFeed } from "../src/lib/ad-catalog.ts";
import { sellableCatalog } from "./support/print-files.ts";

test("generateSeoLandingPages creates programmatic landing pages from catalog tags and payout proof", () => {
  const result = generateSeoLandingPages(catalogArtworks);

  assert.ok(result.pages.length >= catalogArtworks.length);
  assert.ok(result.totalEligible > 0);
  assert.ok(result.pages[0]?.slug.includes("-"));
  assert.ok(result.pages[0]?.payoutProofLine.includes("Artist earns"));
  assert.equal(getSeoIntentLabel("room-style"), "Room & decor intent");
});

test("generateSeoLandingPages blocks live-intent pages when proof or mockups are missing", () => {
  const pending = catalogArtworks.find((artwork) => artwork.status === "Proof pending");
  assert.ok(pending);

  const result = generateSeoLandingPages([pending!]);
  const blocked = result.pages.filter((page) => page.blockers.length > 0);

  assert.ok(blocked.length > 0);
  assert.match(blocked[0]?.primaryCta ?? "", /blocked/i);
});

test("formatSeoVolume renders readable search volume labels", () => {
  assert.equal(formatSeoVolume(850), "850/mo");
  assert.equal(formatSeoVolume(2400), "2.4k/mo");
});

test("getPublishableSeoSlugs only returns pages with consent, readiness and sellability cleared", () => {
  // A sellable catalog, because publishability now includes "the storefront
  // will actually take money for this print" and no seeded artwork carries a
  // print file. Asserting against the seeded catalog would make this test agree
  // with the *operator's* current state rather than with the rule.
  const artworks = sellableCatalog();
  const publishable = getPublishableSeoSlugs(defaultListingConsentRecords, artworks);
  assert.ok(publishable.length > 0);
  assert.ok(publishable.every((slug) => slug.includes("midnight-coast") || slug.length > 0));

  const page = getSeoPageBySlug(publishable[0]!, artworks);
  assert.ok(page);
  const consentGate = buildListingConsentGate(artworks, defaultListingConsentRecords);
  const consentItem = consentGate.items.find((item) => item.artwork.slug === page!.artworkSlug);
  const state = evaluateSeoPagePublishability(
    page!,
    consentItem,
    artworks,
    defaultListingConsentRecords,
  );
  assert.equal(state.publishable, true);
});

/**
 * The reason the test above had to change, stated as its own assertion.
 *
 * `publishable` decides the `robots` directive on `/prints/[slug]`, whether the
 * slug enters `sitemap.xml`, whether the "Shop this print" CTA is live, and
 * whether a row is pushed to Meta, Google and Pinterest as `in stock` with a
 * price. Until 2026-08-06 it was derived from `buildBlockers` — proof, room
 * mockups, SEO copy — which is a second enumeration of listing readiness that
 * never asked whether the print could be bought.
 *
 * The one input that differs between the two catalogs below is the print file.
 * Everything else — consent, proof, mockups, copy, economics — is identical.
 */
test("a print with no print file is never advertised, however ready its listing is", () => {
  const live = catalogArtworks.filter((artwork) => artwork.status === "Live");
  assert.ok(live.length > 0, "fixture is stale — no Live artwork to advertise");

  const withoutFiles = getPublishableSeoSlugs(defaultListingConsentRecords, live);
  const withFiles = getPublishableSeoSlugs(defaultListingConsentRecords, sellableCatalog(live));

  assert.deepEqual(
    withoutFiles,
    [],
    "a listing the storefront refuses to sell must not be indexed, sitemapped or advertised",
  );
  assert.ok(
    withFiles.length > 0,
    "and the gate must still publish once the print file is there — otherwise it is refusing everything for the wrong reason",
  );

  // The refusal has to name the reason an operator can act on, not just fail.
  const page = generateSeoLandingPages(live).pages.find(
    (item) => item.artworkSlug === live[0]!.slug,
  );
  assert.ok(page);
  const consentGate = buildListingConsentGate(live, defaultListingConsentRecords);
  const state = evaluateSeoPagePublishability(
    page!,
    consentGate.items.find((item) => item.artwork.slug === page!.artworkSlug),
    live,
    defaultListingConsentRecords,
  );
  assert.equal(state.publishable, false);
  assert.ok(
    state.blockers.some((blocker) => blocker.startsWith(UNSELLABLE_BLOCKER_PREFIX)),
    `blockers must carry the checkout's own reason, got: ${state.blockers.join(" · ")}`,
  );
  assert.ok(
    state.blockers.some((blocker) => /print file/i.test(blocker)),
    `and it must name the print file, got: ${state.blockers.join(" · ")}`,
  );
});

/**
 * The ad feed is the expensive consumer, so it gets its own assertion rather
 * than inheriting the one above: a row pushed to Meta or Google Merchant Center
 * carries `availability` and a price, and declaring a print in stock when the
 * checkout answers 422 is money spent on clicks that cannot convert.
 */
test("the ad feed never offers an unsellable print as in stock", () => {
  const live = catalogArtworks.filter((artwork) => artwork.status === "Live");
  const consent = live.map((artwork) => ({
    artworkSlug: artwork.slug,
    podLicenseAccepted: true,
    paidAdRightsAccepted: true,
    aiRoomSceneAccepted: true,
    payoutAcknowledged: true,
  }));

  const feed = buildAdCatalogFeed({
    baseUrl: "https://atelier.example.test",
    artworks: live,
    consentRecords: consent,
  });

  assert.ok(feed.items.length > 0, "fixture is stale — no feed rows to check");
  assert.equal(feed.eligibleCount, 0);
  for (const item of feed.items) {
    assert.equal(
      item.availability,
      "out of stock",
      `${item.id} was offered as in stock for a print the storefront refuses to sell`,
    );
  }
});

test("evaluateSeoPagePublishability blocks pages without consent records", () => {
  const page = generateSeoLandingPages(catalogArtworks).pages.find(
    (item) => item.artworkSlug === "spring-bloom",
  );
  assert.ok(page);
  const state = evaluateSeoPagePublishability(page);
  assert.equal(state.publishable, false);
  assert.equal(state.consentBlocked, true);
});

test("buildSitemapEntries only includes publishable print slugs plus static market routes", () => {
  const publishable = getPublishableSeoSlugs();
  const entries = buildSitemapEntries();

  assert.ok(entries.some((entry) => entry.path === "/"));
  assert.ok(entries.some((entry) => entry.path === "/docs"));
  assert.ok(entries.some((entry) => entry.path === "/investor"));
  assert.equal(
    entries.filter((entry) => entry.path.startsWith("/prints/")).length,
    publishable.length,
  );
  for (const slug of publishable) {
    assert.ok(entries.some((entry) => entry.path === `/prints/${slug}`));
  }
});

test("buildSitemapXml emits valid urlset with consent-gated print locations", () => {
  const xml = buildSitemapXml("https://printatelier.com", undefined, undefined, new Date("2026-06-12T00:00:00.000Z"));

  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0.9">/);
  assert.match(xml, /<loc>https:\/\/printatelier\.com\/docs<\/loc>/);
  assert.match(xml, /<lastmod>2026-06-12T00:00:00.000Z<\/lastmod>/);
  assert.doesNotMatch(xml, /spring-bloom/);
});
