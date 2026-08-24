import assert from "node:assert/strict";
import test from "node:test";
import {
  TRADE_DISCOUNT_RATE,
  addLineToProject,
  buildB2BPortalHref,
  createB2BProject,
  filterTradeCatalog,
  parseB2BProjects,
  projectLinesToCheckoutItems,
  removeLineFromProject,
  seedDefaultB2BProjects,
  setProjectLineQuantity,
  summarizeB2BProject,
  tradePriceFromRetail,
} from "../src/lib/b2b-catalog.ts";
import { catalogArtworks } from "../src/lib/marketplace.ts";

test("tradePriceFromRetail applies the published 32% designer discount", () => {
  assert.equal(TRADE_DISCOUNT_RATE, 0.32);
  assert.equal(tradePriceFromRetail(85), 57.8);
  assert.equal(tradePriceFromRetail(110), 74.8);
  assert.equal(tradePriceFromRetail(65), 44.2);
});

test("filterTradeCatalog hides non-live work and matches title, artist, and color", () => {
  const allLive = filterTradeCatalog(catalogArtworks);
  assert.ok(allLive.length > 0);
  assert.ok(allLive.every((artwork) => artwork.status === "Live"));
  assert.ok(!allLive.some((artwork) => artwork.slug === "abstract-no-4"));

  const byQuery = filterTradeCatalog(catalogArtworks, { query: "midnight" });
  assert.deepEqual(byQuery.map((artwork) => artwork.slug), ["midnight-coast"]);

  const byColor = filterTradeCatalog(catalogArtworks, { query: "blue" });
  assert.ok(byColor.some((artwork) => artwork.slug === "midnight-coast"));

  const empty = filterTradeCatalog(catalogArtworks, { query: "no-such-print" });
  assert.deepEqual(empty, []);
});

test("default projects only reference live catalog slugs and summarize pieces", () => {
  const liveSlugs = new Set(
    catalogArtworks.filter((artwork) => artwork.status === "Live").map((artwork) => artwork.slug),
  );
  const projects = seedDefaultB2BProjects();
  const lobby = projects.find((project) => project.id === "hospitality-lobby");
  assert.ok(lobby);
  for (const project of projects) {
    for (const line of project.lines) {
      assert.ok(liveSlugs.has(line.artworkSlug), line.artworkSlug);
    }
  }

  const summary = summarizeB2BProject(lobby);
  assert.equal(summary.pieces, 12);
  assert.equal(summary.distinctPrints, 3);
  assert.equal(summary.unknownSlugs.length, 0);
  assert.equal(summary.tradeSubtotal, 788.8);
  assert.equal(summary.retailSubtotal, 1160);
  assert.equal(summary.savings, 371.2);
});

test("add, quantity, and remove keep a project board accurate", () => {
  const empty = createB2BProject("Pilot suite", "North Studio");
  const withPrint = addLineToProject(empty, "midnight-coast");
  assert.deepEqual(withPrint.lines, [{ artworkSlug: "midnight-coast", quantity: 1 }]);

  const incremented = addLineToProject(withPrint, "midnight-coast", 2);
  assert.deepEqual(incremented.lines, [{ artworkSlug: "midnight-coast", quantity: 3 }]);

  const resized = setProjectLineQuantity(incremented, "midnight-coast", 1);
  assert.deepEqual(resized.lines, [{ artworkSlug: "midnight-coast", quantity: 1 }]);

  const cleared = setProjectLineQuantity(resized, "midnight-coast", 0);
  assert.deepEqual(cleared.lines, []);

  const removed = removeLineFromProject(withPrint, "midnight-coast");
  assert.deepEqual(removed.lines, []);
});

test("createB2BProject rejects blank names and avoids colliding ids", () => {
  assert.throws(() => createB2BProject("  ", "Client"), /Project name is required/);
  assert.throws(() => createB2BProject("Lobby", "  "), /Client name is required/);
  const created = createB2BProject("Marriott Lobby Refresh", "Studio North", ["marriott-lobby-refresh"]);
  assert.ok(created.id.startsWith("marriott-lobby-refresh-"));
  assert.deepEqual(created.lines, []);
});

test("projectLinesToCheckoutItems writes trade unit prices into the checkout cart", () => {
  const project = addLineToProject(createB2BProject("Lobby", "Studio"), "midnight-coast", 2);
  const lines = projectLinesToCheckoutItems(project);
  assert.equal(lines.length, 1);
  assert.equal(lines[0]?.artworkSlug, "midnight-coast");
  assert.equal(lines[0]?.quantity, 2);
  assert.equal(lines[0]?.retailPrice, 57.8);
  assert.equal(lines[0]?.title, "Midnight Coast");
});

test("parseB2BProjects rejects malformed storage and keeps valid boards", () => {
  assert.equal(parseB2BProjects(null), null);
  assert.equal(parseB2BProjects("{not-json"), null);
  assert.equal(parseB2BProjects("[]"), null);

  const parsed = parseB2BProjects(
    JSON.stringify([
      { id: "lobby", name: "Lobby", client: "Studio", lines: [{ artworkSlug: "midnight-coast", quantity: 2.8 }] },
      { id: 12, name: "bad" },
    ]),
  );
  assert.deepEqual(parsed, [
    {
      id: "lobby",
      name: "Lobby",
      client: "Studio",
      lines: [{ artworkSlug: "midnight-coast", quantity: 2 }],
    },
  ]);
});

test("buildB2BPortalHref omits empty queries", () => {
  assert.equal(buildB2BPortalHref(), "/b2b-portal");
  assert.equal(buildB2BPortalHref("  "), "/b2b-portal");
  assert.equal(buildB2BPortalHref("blue coast"), "/b2b-portal?q=blue%20coast");
});
