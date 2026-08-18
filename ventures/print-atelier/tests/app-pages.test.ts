import { describe, it } from "node:test";
import assert from "node:assert/strict";
import AdCatalogPage from "../src/app/ad-catalog/page.tsx";
import AdSyncHealthPage from "../src/app/ad-sync-health/page.tsx";
import AdminPortal from "../src/app/admin-portal/page.tsx";
import ArtistOnboardPage from "../src/app/artist-onboard/page.tsx";
import ArtistPortal from "../src/app/artist-portal/page.tsx";

describe("App pages coverage exercises", () => {
  it("renders AdCatalogPage element structure", () => {
    const element = AdCatalogPage();
    assert.ok(element);
    assert.equal(element.type, "div");
  });

  it("renders AdSyncHealthPage element structure", () => {
    const element = AdSyncHealthPage();
    assert.ok(element);
  });

  it("exports AdminPortal component function", () => {
    assert.equal(typeof AdminPortal, "function");
  });

  it("renders ArtistOnboardPage with default parameters", async () => {
    const element = await ArtistOnboardPage({ searchParams: Promise.resolve({}) });
    assert.ok(element);
  });

  it("renders ArtistOnboardPage with prefilled outreach parameters", async () => {
    const element = await ArtistOnboardPage({
      searchParams: Promise.resolve({ source: "outreach", handle: "alex_j", name: "Alex Jenkins" }),
    });
    assert.ok(element);
  });

  it("exports ArtistPortal component function", () => {
    assert.equal(typeof ArtistPortal, "function");
  });
});
