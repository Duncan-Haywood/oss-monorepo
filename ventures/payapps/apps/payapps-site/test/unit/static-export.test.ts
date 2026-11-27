// The static copy the catalogue serves at marisstella.app/payapps/ (src/site/static-export.ts):
// committed in ventures/payapps/site/, so it must match a fresh export, carry no form that needs
// the Worker, and link nothing that is not in it.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { PAGES } from "@shared/site";
import { buildSite } from "@site/build";
import { STATIC_EXPORT_DIR, staticFiles } from "@site/static-export";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../..", import.meta.url));
const dir = join(root, STATIC_EXPORT_DIR);
const APP = "https://payapps.example.com";

function listFiles(d: string): string[] {
  return readdirSync(d).flatMap((n) => {
    const full = join(d, n);
    return statSync(full).isDirectory() ? listFiles(full) : [relative(dir, full)];
  });
}

describe("static export", () => {
  it("is committed and matches a fresh export (run `pnpm export:static`)", () => {
    expect(existsSync(join(dir, "index.html"))).toBe(true);
    const want = staticFiles(root);
    expect(listFiles(dir).sort()).toEqual([...want.keys()].sort());
    for (const [rel, contents] of want) {
      expect(readFileSync(join(dir, rel), "utf8"), rel).toBe(contents);
    }
  });

  it("refuses to build before launch: the early-access form needs the Worker", () => {
    expect(() => staticFiles(root, { appUrl: null })).toThrow(/APP_URL/);
  });

  const files = staticFiles(root, { appUrl: APP });

  it("has no early-access page, form or API link", () => {
    expect(files.has(PAGES.earlyAccess.file)).toBe(false);
    expect(files.has(PAGES.checkEmail.file)).toBe(false);
    expect(files.has("_headers")).toBe(false);
    for (const [rel, doc] of files) {
      expect(doc, rel).not.toContain("/payapps/early-access");
      expect(doc, rel).not.toContain("/payapps/api/");
      expect(doc, rel).not.toContain("<form");
    }
    // The Worker build still has them.
    const worker = buildSite({ siteUrl: "https://marisstella.app/payapps", appUrl: APP });
    expect(worker.has(PAGES.earlyAccess.file)).toBe(true);
  });

  it("links its own pages relatively (no root-absolute link) and every link resolves", () => {
    const pages = new Set(
      [...files.keys()].filter((f) => f.endsWith(".html")).map((f) => f.replace(/\.html$/, "")),
    );
    for (const [rel, doc] of files) {
      if (!rel.endsWith(".html")) continue;
      expect(doc, rel).not.toMatch(/(href|src|action)="\//);
      for (const [, url] of doc.matchAll(/href="([^"#:]*)"/g)) {
        if (url === "" || url === "./") continue;
        expect(pages.has(url ?? "") || files.has(url ?? ""), `${rel} links ${url}`).toBe(true);
      }
      expect(doc, rel).toContain("No warranty");
    }
    expect(files.has("404.html")).toBe(false);
  });

  it("says the pages store nothing and points to the app's own privacy policy", () => {
    const privacy = files.get(PAGES.privacy.file) ?? "";
    expect(privacy).toContain("Privacy notice for this website");
    expect(privacy).toContain(`href="${APP}/legal/privacy"`);
    expect(privacy).not.toMatch(/join early access|early-access list/i);
    // The catalogue's counter (platform/counter) runs on these pages, so the notice names it.
    expect(privacy).toContain("counts page loads without cookies");
    expect(files.get("sitemap.xml")).not.toContain("early-access");
    expect(files.get("llms.txt")).not.toContain("early-access");
    expect(files.get("feed.xml")).not.toContain("early-access");
  });
});
