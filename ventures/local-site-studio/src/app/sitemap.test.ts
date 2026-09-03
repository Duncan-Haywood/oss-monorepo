import { describe, expect, it, vi } from "vitest";
import { DOCS_PAGES } from "@/lib/docs/routes";
import { DEMO_LEADS } from "@/lib/leads/demo-catalog";
import { CATEGORY_LANDING_PAGES } from "@/lib/marketing/category-landing";
import { siteUrl } from "@/lib/seo";

const getLeads = vi.fn();

vi.mock("@/lib/db", () => ({
  getLeads: (...args: unknown[]) => getLeads(...args),
}));

describe("sitemap", () => {
  it("declares a revalidate window so paid/live leads aren't frozen out until the next deploy", async () => {
    const mod = await import("./sitemap");
    expect(mod.revalidate).toBeTypeOf("number");
    expect(mod.revalidate).toBeGreaterThan(0);
  });

  it("lists every /docs/* sub-page from DOCS_PAGES, not a stale hand-copied subset", async () => {
    getLeads.mockResolvedValue([]);
    const sitemap = (await import("./sitemap")).default;
    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);

    expect(DOCS_PAGES.length).toBeGreaterThan(2);
    const base = siteUrl();
    for (const page of DOCS_PAGES) {
      expect(urls).toContain(`${base}${page.href}`);
    }
  });

  it("lists every /websites-for-* category landing page from CATEGORY_LANDING_PAGES, not a stale hand-copied subset", async () => {
    getLeads.mockResolvedValue([]);
    const sitemap = (await import("./sitemap")).default;
    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);

    expect(CATEGORY_LANDING_PAGES.length).toBeGreaterThan(0);
    const base = siteUrl();
    for (const page of CATEGORY_LANDING_PAGES) {
      expect(urls).toContain(`${base}${page.href}`);
    }
  });

  it("still includes the top-level static routes and every curated demo preview", async () => {
    getLeads.mockResolvedValue([]);
    const sitemap = (await import("./sitemap")).default;
    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);
    const base = siteUrl();

    for (const path of ["", "/checkout", "/accessibility-evidence", "/docs", "/privacy", "/terms"]) {
      expect(urls).toContain(`${base}${path}`);
    }
    for (const demo of DEMO_LEADS) {
      expect(urls.some((url) => url.includes(`/preview/${demo.slug}`))).toBe(true);
    }
  });
});
