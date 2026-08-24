import assert from "node:assert/strict";
import test from "node:test";
import { catalogArtworks } from "../src/lib/marketplace.ts";
import {
  buildBuyerPortalHref,
  deriveBuyerPrintSize,
  parseBuyerCatalogSearchParams,
  searchBuyerCatalog,
} from "../src/lib/buyer-catalog.ts";

test("searchBuyerCatalog uses the live catalog and hides proof-pending work", () => {
  const result = searchBuyerCatalog();
  assert.equal(result.totalLive, catalogArtworks.filter((artwork) => artwork.status === "Live").length);
  assert.equal(result.matched, result.totalLive);
  assert.ok(!result.listings.some((listing) => listing.artwork.slug === "abstract-no-4"));
  assert.ok(result.listings.every((listing) => listing.printHref.startsWith("/prints/")));
  assert.ok(result.listings.every((listing) => listing.checkoutHref.startsWith("/checkout?add=")));
});

test("searchBuyerCatalog matches title, artist, style, and color tags", () => {
  const byTitle = searchBuyerCatalog({ query: "midnight" });
  assert.deepEqual(
    byTitle.listings.map((listing) => listing.artwork.slug),
    ["midnight-coast"],
  );

  const byArtist = searchBuyerCatalog({ query: "elena" });
  assert.ok(byArtist.listings.length >= 2);
  assert.ok(byArtist.listings.every((listing) => listing.artwork.artistName === "Elena Rostova"));

  const byStyle = searchBuyerCatalog({ styles: ["Abstract"] });
  assert.ok(byStyle.listings.length > 0);
  assert.ok(byStyle.listings.every((listing) => listing.artwork.style === "Abstract"));
});

test("searchBuyerCatalog can keep only consent-cleared checkout-ready prints", () => {
  const ready = searchBuyerCatalog({ checkoutReadyOnly: true });
  assert.ok(ready.listings.length > 0);
  assert.ok(ready.listings.every((listing) => listing.checkoutEligible));
  assert.ok(ready.listings.some((listing) => listing.artwork.slug === "midnight-coast"));
  assert.ok(!ready.listings.some((listing) => listing.artwork.slug === "spring-bloom"));
});

test("searchBuyerCatalog sorts recommended checkout-ready prints first", () => {
  const result = searchBuyerCatalog({ sort: "recommended" });
  assert.equal(result.listings[0]?.artwork.slug, "midnight-coast");
  assert.equal(result.listings[0]?.checkoutEligible, true);

  const byPrice = searchBuyerCatalog({ sort: "price-asc" });
  const prices = byPrice.listings.map((listing) => listing.artwork.retailPrice);
  assert.deepEqual(prices, [...prices].sort((left, right) => left - right));
});

test("deriveBuyerPrintSize bands retail price into framed sizes", () => {
  const spring = catalogArtworks.find((artwork) => artwork.slug === "spring-bloom");
  const midnight = catalogArtworks.find((artwork) => artwork.slug === "midnight-coast");
  const city = catalogArtworks.find((artwork) => artwork.slug === "city-at-dusk");
  assert.ok(spring && midnight && city);
  assert.equal(deriveBuyerPrintSize(spring), "Small");
  assert.equal(deriveBuyerPrintSize(midnight), "Medium");
  assert.equal(deriveBuyerPrintSize(city), "Large");
});

test("parseBuyerCatalogSearchParams and href builder stay reversible", () => {
  const query = parseBuyerCatalogSearchParams({
    q: "blue",
    style: ["Landscape", "Minimal"],
    size: "Medium",
    artist: "Elena Rostova",
    ready: "1",
    sort: "price-desc",
  });

  assert.deepEqual(query, {
    query: "blue",
    styles: ["Landscape", "Minimal"],
    sizes: ["Medium"],
    artists: ["Elena Rostova"],
    checkoutReadyOnly: true,
    sort: "price-desc",
  });

  assert.equal(
    buildBuyerPortalHref(query),
    "/buyer-portal?q=blue&style=Landscape&style=Minimal&size=Medium&artist=Elena+Rostova&ready=1&sort=price-desc",
  );
  assert.equal(buildBuyerPortalHref({}), "/buyer-portal");
});

test("empty search reports a helpful zero-match result", () => {
  const empty = searchBuyerCatalog({ query: "no-such-print" });
  assert.equal(empty.matched, 0);
  assert.deepEqual(empty.listings, []);
  assert.ok(empty.totalLive > 0);
});
