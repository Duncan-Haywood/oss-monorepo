// The module landing pages (src/shared/modules.ts): one per built feature, honest, indexed and linked.

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { MODULE_PAGES } from "@shared/modules";
import { PAGE_LIST } from "@shared/site";
import { buildSite } from "@site/build";
import { esc } from "@site/html";
import { FEATURES } from "@site/pages";
import { describe, expect, it } from "vitest";

const SITE = "https://marisstella.app/payapps";
const pre = buildSite({ siteUrl: SITE, appUrl: null });
const open = buildSite({
  siteUrl: SITE,
  appUrl: "https://payapps.marisstella.app",
  earlyAccess: false,
});
const GUIDES_ROOT = join(__dirname, "../../../../../..");

describe("module pages", () => {
  it("each renders a built feature, with unique paths and titles that differ from the core pages", () => {
    const paths = new Set(PAGE_LIST.map((p) => p.path));
    const titles = new Set(PAGE_LIST.map((p) => p.title));
    for (const m of MODULE_PAGES) {
      const f = FEATURES.find((x) => x.id === m.featureId);
      expect(f?.status, m.featureId).toBe("built");
      expect(paths.has(m.page.path), m.page.path).toBe(false);
      expect(titles.has(m.page.title), m.page.title).toBe(false);
      paths.add(m.page.path);
      titles.add(m.page.title);
      expect(m.page.description.length, m.page.path).toBeGreaterThanOrEqual(70);
      expect(m.page.description.length, m.page.path).toBeLessThanOrEqual(160);
      expect(m.page.title.length, m.page.path).toBeLessThanOrEqual(70);
    }
  });

  it("are written with canonical, FAQ and breadcrumb data, and the feature's own bullets", () => {
    for (const m of MODULE_PAGES) {
      const doc = open.get(m.page.file);
      expect(doc, m.page.file).toBeDefined();
      expect(doc).toContain(`<link rel="canonical" href="${SITE}${m.page.path}">`);
      expect(doc).toContain('"FAQPage"');
      expect(doc).toContain('"BreadcrumbList"');
      const f = FEATURES.find((x) => x.id === m.featureId);
      expect(doc).toContain(esc(f?.bullets[0] ?? "?"));
      expect(doc).toContain(`from=payapps-site%2Fmodule%2F${m.featureId}`);
      expect(doc).not.toMatch(/aggregateRating|testimonial|trusted by/i);
    }
  });

  it("say Crew and up exactly where the app gates the feature", () => {
    const crew = new Set(["lien-waivers", "quickbooks", "job-cost"]);
    for (const m of MODULE_PAGES) {
      expect(m.plan.startsWith("Crew plan and up"), m.featureId).toBe(crew.has(m.featureId));
    }
  });

  it("link only free guides that exist in this repository", () => {
    for (const m of MODULE_PAGES) {
      for (const g of m.guides) {
        const rel = g.path.endsWith("/") ? `${g.path}index.html` : g.path;
        const [, slug, file] = rel.split("/");
        expect(readdirSync(join(GUIDES_ROOT, "ventures", slug ?? "")), g.path).toContain(file);
      }
    }
  });

  it("are in the sitemap and llms.txt, and linked from the features page", () => {
    for (const files of [pre, open]) {
      for (const m of MODULE_PAGES) {
        expect(files.get("sitemap.xml")).toContain(`<loc>${SITE}${m.page.path}</loc>`);
        expect(files.get("llms.txt")).toContain(`(${SITE}${m.page.path})`);
        expect(files.get("features.html")).toContain(`href="/payapps${m.page.path}"`);
      }
    }
  });
});
