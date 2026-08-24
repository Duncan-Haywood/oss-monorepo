import assert from "node:assert/strict";
import test from "node:test";
import { catalogArtworks } from "../src/lib/marketplace.ts";
import {
  buildStorefrontHref,
  filterStorefrontListings,
  listStorefrontArtists,
  listStorefrontStyles,
} from "../src/lib/storefront-catalog.ts";

const live = catalogArtworks.filter((artwork) => artwork.status === "Live");

test("filterStorefrontListings hides proof-pending work from the buyer catalog", () => {
  const visible = filterStorefrontListings(catalogArtworks);
  assert.equal(visible.length, live.length);
  assert.ok(visible.every((artwork) => artwork.status === "Live"));
  assert.ok(!visible.some((artwork) => artwork.slug === "abstract-no-4"));
});

test("filterStorefrontListings matches title, artist, style, and color tags", () => {
  const byTitle = filterStorefrontListings(catalogArtworks, { query: "midnight" });
  assert.deepEqual(byTitle.map((artwork) => artwork.slug), ["midnight-coast"]);

  const byArtist = filterStorefrontListings(catalogArtworks, { query: "elena" });
  assert.ok(byArtist.length >= 2);
  assert.ok(byArtist.every((artwork) => artwork.artistName === "Elena Rostova"));

  const byTag = filterStorefrontListings(catalogArtworks, { query: "blue" });
  assert.ok(byTag.some((artwork) => artwork.slug === "midnight-coast"));

  const byStyleChip = filterStorefrontListings(catalogArtworks, { style: "Abstract" });
  assert.ok(byStyleChip.length > 0);
  assert.ok(byStyleChip.every((artwork) => artwork.style === "Abstract"));
});

test("filterStorefrontListings combines query with artist and style chips", () => {
  const combined = filterStorefrontListings(catalogArtworks, {
    query: "coast",
    artist: "Elena Rostova",
    style: "Landscape",
  });
  assert.deepEqual(combined.map((artwork) => artwork.slug), ["midnight-coast"]);

  const empty = filterStorefrontListings(catalogArtworks, { query: "no-such-print" });
  assert.deepEqual(empty, []);
});

test("listStorefrontArtists and styles are unique live values", () => {
  const artists = listStorefrontArtists(catalogArtworks);
  const styles = listStorefrontStyles(catalogArtworks);
  assert.ok(artists.includes("Elena Rostova"));
  assert.ok(artists.includes("Marcus Chen"));
  assert.ok(!artists.includes("Alex Jenkins"));
  assert.ok(styles.includes("Landscape"));
  assert.equal(new Set(artists).size, artists.length);
});

test("buildStorefrontHref omits empty filters", () => {
  assert.equal(buildStorefrontHref({}), "/storefront");
  assert.equal(buildStorefrontHref({ style: "All" }), "/storefront");
  assert.equal(
    buildStorefrontHref({ query: "blue", style: "Landscape", artist: "Elena Rostova" }),
    "/storefront?q=blue&style=Landscape&artist=Elena+Rostova",
  );
});
