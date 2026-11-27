// catalogue-export/ is the committed static copy the catalogue serves at marisstella.app/payapps/
// (src/site/catalogue.ts). It must be exactly what the current pages, plans and launch switch build.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { buildSite } from "@site/build";
import { CATALOGUE_EXPORT_DIR, catalogueFiles } from "@site/catalogue";
import { describe, expect, it } from "vitest";

const BINARY = /\.(webp|png)$/;

function onDisk(dir: string): Map<string, string | Buffer> {
  const out = new Map<string, string | Buffer>();
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else {
        const rel = relative(dir, p).split("\\").join("/");
        out.set(rel, BINARY.test(rel) ? readFileSync(p) : readFileSync(p, "utf8"));
      }
    }
  };
  walk(dir);
  return out;
}

const expected = catalogueFiles();

describe("catalogue export", () => {
  it("matches the build (run `pnpm export:catalogue` after changing the site)", () => {
    const actual = onDisk(CATALOGUE_EXPORT_DIR);
    expect([...actual.keys()].sort()).toEqual([...expected.keys()].sort());
    for (const [rel, contents] of expected) {
      const stale = `catalogue-export/${rel} is stale: pnpm export:catalogue`;
      if (typeof contents === "string") expect(actual.get(rel), stale).toBe(contents);
      else expect(Buffer.compare(actual.get(rel) as Buffer, contents), stale).toBe(0);
    }
  });

  it("has no early-access pages, form or API links, since no Worker is behind it", () => {
    for (const [rel, contents] of expected) {
      expect(rel).not.toMatch(/early-access/);
      if (typeof contents !== "string") continue;
      expect(contents, rel).not.toMatch(/early-access|\/api\/early|<form/);
    }
  });

  it("links only to pages and files it contains, or to the app", () => {
    const pages = new Set([...expected.keys()].map((f) => `/payapps/${f.replace(/\.html$/, "")}`));
    pages.add("/payapps/");
    for (const [rel, contents] of expected) {
      if (!rel.endsWith(".html") || typeof contents !== "string") continue;
      for (const m of contents.matchAll(/href="(\/[^"#]*)"/g)) {
        const target = m[1] ?? "";
        const file = target.replace(/^\/payapps\//, "");
        expect(pages.has(target) || expected.has(file), `${rel} links ${target}`).toBe(true);
      }
    }
  });

  it("says the site stores nothing and points at the app's privacy policy", () => {
    const privacy = String(expected.get("privacy.html") ?? "");
    expect(privacy).toContain("no forms, set no cookies");
    expect(privacy).toContain('href="https://payapps.marisstella.app/legal/privacy"');
  });

  it("refuses to drop the list before launch, when it is the site's only action", () => {
    expect(() =>
      buildSite({ siteUrl: "https://marisstella.app/payapps", appUrl: null, earlyAccess: false }),
    ).toThrow(/needs APP_URL/);
  });
});
