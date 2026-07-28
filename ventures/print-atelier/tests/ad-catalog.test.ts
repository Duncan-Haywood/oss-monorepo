import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAdCatalogFeed,
  evaluateAdCatalogEligibility,
  serializeAdCatalogFeedJson,
  serializeMetaCatalogFeedCsv,
} from "../src/lib/ad-catalog.ts";
import { catalogArtworks, defaultListingConsentRecords } from "../src/lib/marketplace.ts";
import { generateSeoLandingPages, getSeoPagesWithPublishState } from "../src/lib/seo.ts";

test("buildAdCatalogFeed only marks items eligible when SEO publish, paid-ad consent, and creative readiness pass", () => {
  const feed = buildAdCatalogFeed({ baseUrl: "https://printatelier.com" });

  assert.ok(feed.items.length > 0);
  assert.ok(feed.eligibleCount > 0);
  assert.ok(feed.blockedCount > 0);
  assert.ok(feed.feedHealthScore >= 0 && feed.feedHealthScore <= 100);

  const eligible = feed.items.find((item) => item.eligible);
  assert.ok(eligible);
  assert.equal(eligible.blockers.length, 0);
  assert.ok(eligible.creativeReadinessScore >= 60);
  assert.match(eligible.link, /\/prints\//);

  const blocked = feed.items.find((item) => !item.eligible);
  assert.ok(blocked);
  assert.ok(blocked.blockers.length > 0);
});

test("buildAdCatalogFeed tracks per-platform sync readiness against partner creative minimums", () => {
  const feed = buildAdCatalogFeed({ baseUrl: "https://printatelier.com" });

  assert.ok(feed.platformSummary.meta);
  assert.ok(feed.platformSummary.google);
  assert.ok(feed.platformSummary.pinterest);
  assert.equal(
    feed.platformSummary.meta.eligible,
    feed.items.filter((item) => item.platform === "meta" && item.eligible).length,
  );
  assert.equal(typeof feed.platformSummary.meta.minCreativesMet, "boolean");
});

test("evaluateAdCatalogEligibility blocks pages without paid-ad consent", () => {
  const pages = getSeoPagesWithPublishState(defaultListingConsentRecords, catalogArtworks);
  const page = pages[0]!;
  const artwork = catalogArtworks.find((item) => item.slug === page.artworkSlug);

  const result = evaluateAdCatalogEligibility(page, page.publishState, artwork, false);

  assert.equal(result.eligible, false);
  assert.ok(result.blockers.some((blocker) => blocker.includes("Paid ad rights")));
});

test("serializeAdCatalogFeedJson and serializeMetaCatalogFeedCsv export eligible catalog rows", () => {
  const feed = buildAdCatalogFeed({ baseUrl: "https://printatelier.com" });
  const json = serializeAdCatalogFeedJson(feed);
  const parsed = JSON.parse(json) as { items: unknown[]; eligibleCount: number };

  assert.equal(parsed.items.length, feed.eligibleCount);
  assert.equal(parsed.eligibleCount, feed.eligibleCount);

  const csv = serializeMetaCatalogFeedCsv(feed, "meta");
  const lines = csv.trim().split("\n");
  assert.ok(lines[0]?.startsWith("id,title"));
  assert.ok(lines.length > 1);
});

test("generateSeoLandingPages still produces pages referenced by ad catalog feed slugs", () => {
  const seo = generateSeoLandingPages(catalogArtworks);
  const feed = buildAdCatalogFeed();
  const seoSlugs = new Set(seo.pages.map((page) => page.slug));

  for (const item of feed.items) {
    assert.ok(seoSlugs.has(item.seoSlug));
  }
});
