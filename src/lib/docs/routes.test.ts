import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DOCS_PAGES } from "./routes";

const REPO_ROOT = path.resolve(__dirname, "../../..");

/**
 * Every /docs/<slug>/page.tsx directory under src/app/docs, excluding the
 * index page itself (src/app/docs/page.tsx, which renders DOCS_PAGES rather
 * than being one of its entries).
 */
function listDocsSubPageSlugs(): string[] {
  const docsDir = path.join(REPO_ROOT, "src/app/docs");
  return readdirSync(docsDir).filter((entry) => {
    const entryPath = path.join(docsDir, entry);
    return statSync(entryPath).isDirectory();
  });
}

describe("DOCS_PAGES vs. src/app/docs/* filesystem (repo)", () => {
  it("has exactly one entry per docs sub-page directory — no orphan page, no stale entry", () => {
    const filesystemSlugs = listDocsSubPageSlugs().sort();
    const registeredSlugs = DOCS_PAGES.map((page) => page.href.replace(/^\/docs\//, "")).sort();

    // A page under src/app/docs/<slug>/page.tsx with no DOCS_PAGES entry ships
    // indexable-but-unlisted from /docs and sitemap.xml — the exact bug class
    // routes.ts's own file header describes (fixed 2026-07-18 in the sitemap
    // direction; this guards the DOCS_PAGES-authoring direction instead).
    expect(filesystemSlugs).toEqual(registeredSlugs);
  });

  it("has a non-empty title, href, and description for every entry", () => {
    for (const page of DOCS_PAGES) {
      expect(page.title.trim().length).toBeGreaterThan(0);
      expect(page.href).toMatch(/^\/docs\/[a-z0-9-]+$/);
      expect(page.description.trim().length).toBeGreaterThan(0);
    }
  });
});
