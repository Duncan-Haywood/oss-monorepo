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
} from "../src/lib/seo.ts";
import { buildListingConsentGate, defaultListingConsentRecords } from "../src/lib/marketplace.ts";

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

test("getPublishableSeoSlugs only returns pages with consent and readiness cleared", () => {
  const publishable = getPublishableSeoSlugs();
  assert.ok(publishable.length > 0);
  assert.ok(publishable.every((slug) => slug.includes("midnight-coast") || slug.length > 0));

  const page = getSeoPageBySlug(publishable[0]!);
  assert.ok(page);
  const consentGate = buildListingConsentGate(catalogArtworks, defaultListingConsentRecords);
  const consentItem = consentGate.items.find((item) => item.artwork.slug === page!.artworkSlug);
  const state = evaluateSeoPagePublishability(page!, consentItem);
  assert.equal(state.publishable, true);
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
