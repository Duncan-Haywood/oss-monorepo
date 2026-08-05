import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { buildListingSellabilityReport } from "../src/lib/listing-sellability";
import { validateCheckoutLineItem } from "../src/lib/checkout";
import {
  buildPayoutExceptionQueue,
  catalogArtworks,
  type CatalogArtwork,
  type ListingConsentRecord,
} from "../src/lib/marketplace";

/**
 * The defect this file pins, measured on the seeded catalog 2026-08-05:
 *
 *   checkout-eligible listings ... 0 of 6
 *   payout exception queue ....... 1
 *
 * The operator's only exception list reported one problem while the storefront
 * was refusing to sell every single listing. The two enumerated their blockers
 * separately and drifted, which is why the tests below check the *relationship*
 * between the two surfaces rather than either one's output.
 */

const VENTURE_ROOT = fileURLToPath(new URL("..", import.meta.url));

function artwork(overrides: Partial<CatalogArtwork> = {}): CatalogArtwork {
  return {
    id: 99,
    slug: "test-piece",
    title: "Test Piece",
    artistName: "Test Artist",
    artistInitials: "TA",
    style: "Abstract",
    status: "Live",
    retailPrice: 100,
    fulfillmentCost: 30,
    imageClass: "bg-black",
    tags: [],
    hasSeoCopy: true,
    hasRoomMockups: true,
    hasApprovedProof: true,
    salesLast30Days: 0,
    projectedMonthlyArtistPayout: 0,
    printFileUrl: "https://example.test/master.tif",
    ...overrides,
  };
}

/** Consent that clears every channel, so only the field under test blocks. */
const clearedConsent = (slug: string): ListingConsentRecord[] => [
  {
    artworkSlug: slug,
    podLicenseAccepted: true,
    paidAdRightsAccepted: true,
    aiRoomSceneAccepted: true,
    payoutAcknowledged: true,
  },
];

// --- the relationship that drifted -----------------------------------------

test("no listing the storefront refuses is missing from the operator report", () => {
  const report = buildListingSellabilityReport();

  const refusedByStorefront = catalogArtworks
    .filter((art) => !validateCheckoutLineItem(art).eligible)
    .map((art) => art.slug)
    .sort();
  const namedByReport = report.blocked.map((listing) => listing.slug).sort();

  assert.deepEqual(
    namedByReport,
    refusedByStorefront,
    "the operator surface and the storefront disagree about which listings can be sold — the exact drift this module exists to prevent",
  );
});

test("sellableCount agrees with the storefront, artwork for artwork", () => {
  const report = buildListingSellabilityReport();
  const eligible = catalogArtworks.filter((art) => validateCheckoutLineItem(art).eligible);

  assert.equal(report.sellableCount, eligible.length);
  assert.equal(report.totalListings, catalogArtworks.length);
  assert.equal(report.sellableCount + report.blocked.length, report.totalListings);
});

test("the payout exception queue alone does not cover sellability", () => {
  // Not a criticism of that queue — it answers a different question (margin,
  // artist floor, POD benchmark). This asserts the gap is real, so that deleting
  // this module in favour of the queue fails loudly rather than silently
  // restoring a dashboard that reports no exception over an unsellable catalog.
  const queueSlugs = new Set(
    buildPayoutExceptionQueue(catalogArtworks).map((item) => item.artwork.slug),
  );
  const unreported = buildListingSellabilityReport().blocked.filter(
    (listing) => !queueSlugs.has(listing.slug),
  );

  assert.ok(
    unreported.length > 0,
    "expected at least one unsellable listing the payout queue does not report; if this ever legitimately reaches zero, check the queue really covers checkout eligibility before deleting this test",
  );
});

// --- every blocker carries a usable remedy ---------------------------------

const blockerCases: Array<{ code: string; art: CatalogArtwork }> = [
  { code: "listing-not-live", art: artwork({ status: "Proof pending" }) },
  { code: "proof-not-approved", art: artwork({ hasApprovedProof: false }) },
  { code: "print-file-missing", art: artwork({ printFileUrl: undefined }) },
  { code: "print-file-not-fetchable", art: artwork({ printFileUrl: "http://example.test/a.tif" }) },
  { code: "negative-unit-economics", art: artwork({ retailPrice: 10, fulfillmentCost: 30 }) },
];

for (const { code, art } of blockerCases) {
  test(`${code} reaches the operator report with an action and a remedy`, () => {
    const report = buildListingSellabilityReport([art], clearedConsent(art.slug));

    const group = report.blockerGroups.find((g) => g.code === code);
    assert.ok(group, `expected a ${code} group, got: ${report.blockerGroups.map((g) => g.code).join(", ")}`);
    assert.ok(group.remedy.trim().length > 0, `${code} has an empty remedy`);
    assert.deepEqual(group.slugs, [art.slug]);

    const listing = report.blocked.find((l) => l.slug === art.slug);
    assert.ok(listing, `${code}: listing missing from blocked list`);
    const blocker = listing.blockers.find((b) => b.code === code);
    assert.ok(blocker, `${code}: blocker missing from listing`);
    assert.ok(
      blocker.operatorAction.trim().length > 0,
      `${code} has an empty operatorAction — the queue's whole value is saying what to do next`,
    );
  });
}

test("a group's remedy never names one artwork", () => {
  // The bug this prevents: a group covering six listings borrowing the
  // per-listing instruction of whichever sorted first, and reading as though
  // only that one artwork were affected.
  const report = buildListingSellabilityReport();
  const names = catalogArtworks.flatMap((art) => [art.title, art.slug, art.artistName]);

  for (const group of report.blockerGroups) {
    for (const name of names) {
      assert.ok(
        !group.remedy.includes(name),
        `group ${group.code} names "${name}" in a remedy that covers ${group.slugs.length} listings`,
      );
    }
  }
});

test("wouldFullyUnblock only counts listings with no other blocker", () => {
  const onlyPrintFile = artwork({ slug: "only-file", printFileUrl: undefined });
  const alsoUnapproved = artwork({
    slug: "also-proof",
    printFileUrl: undefined,
    hasApprovedProof: false,
  });

  const report = buildListingSellabilityReport(
    [onlyPrintFile, alsoUnapproved],
    [...clearedConsent("only-file"), ...clearedConsent("also-proof")],
  );
  const group = report.blockerGroups.find((g) => g.code === "print-file-missing");

  assert.ok(group);
  assert.deepEqual(group.slugs.sort(), ["also-proof", "only-file"]);
  assert.deepEqual(
    group.wouldFullyUnblock,
    ["only-file"],
    "a listing that also fails another check does not go on sale when this one code is cleared",
  );
});

// --- the honest-headline cases ---------------------------------------------

test("storefrontTakesNoMoney is true only when nothing at all can be sold", () => {
  const sellable = artwork({ slug: "sellable" });
  const blocked = artwork({ slug: "blocked", printFileUrl: undefined });

  const allBlocked = buildListingSellabilityReport([blocked], clearedConsent("blocked"));
  assert.equal(allBlocked.storefrontTakesNoMoney, true);
  assert.match(allBlocked.headline, /No listing of 1 can be sold/);

  const mixed = buildListingSellabilityReport(
    [sellable, blocked],
    [...clearedConsent("sellable"), ...clearedConsent("blocked")],
  );
  assert.equal(mixed.storefrontTakesNoMoney, false);
  assert.match(mixed.headline, /1 of 2 listings cannot be sold/);

  const clean = buildListingSellabilityReport([sellable], clearedConsent("sellable"));
  assert.equal(clean.storefrontTakesNoMoney, false);
  assert.equal(clean.sellableCount, 1);
  assert.match(clean.headline, /All 1 listings can be sold/);

  // An empty catalog sells nothing, but calling that "cannot sell" would be a
  // false alarm on a fresh install.
  assert.equal(buildListingSellabilityReport([], []).storefrontTakesNoMoney, false);
});

// --- the panel has to actually be on the page ------------------------------

/**
 * A source contract, not a render test.
 *
 * The failure mode is the report being computed and never shown — this venture
 * has shipped that shape before. Asserting against the module would pass with
 * the panel deleted, so this reads the page source instead.
 */
test("the admin portal renders the sellability report", () => {
  const source = readFileSync(`${VENTURE_ROOT}src/app/admin-portal/page.tsx`, "utf8");

  assert.match(
    source,
    /import \{ buildListingSellabilityReport \}/,
    "admin portal no longer imports the sellability report",
  );
  assert.match(
    source,
    /sellability\.headline/,
    "the report is computed but its headline is not rendered",
  );
  assert.match(
    source,
    /sellability\.blockerGroups\.map/,
    "the per-blocker operator actions are not rendered",
  );
  assert.match(
    source,
    /sellability\.storefrontTakesNoMoney/,
    "the status badge no longer reads the one condition that decides whether anything can be sold",
  );
});
