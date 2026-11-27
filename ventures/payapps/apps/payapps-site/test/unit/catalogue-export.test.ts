// catalogue-export/ is the committed static copy the catalogue serves at marisstella.app/payapps/
// (src/site/catalogue.ts). It must be exactly what the current pages, plans and launch switch build.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { buildSite } from "@site/build";
import { CATALOGUE_EXPORT_DIR, catalogueFiles } from "@site/catalogue";
import { describe, expect, it } from "vitest";

function onDisk(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.set(relative(dir, p).split("\\").join("/"), readFileSync(p, "utf8"));
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
      expect(actual.get(rel), `catalogue-export/${rel} is stale: pnpm export:catalogue`).toBe(
        contents,
      );
    }
  });

  it("has no early-access pages, form or API links, since no Worker is behind it", () => {
    for (const [rel, contents] of expected) {
      expect(rel).not.toMatch(/early-access/);
      expect(contents, rel).not.toMatch(/early-access|\/api\/early|<form/);
    }
  });

  it("links only to pages it contains, or to the app", () => {
    const pages = new Set([...expected.keys()].map((f) => `/payapps/${f.replace(/\.html$/, "")}`));
    pages.add("/payapps/");
    for (const [rel, contents] of expected) {
      if (!rel.endsWith(".html")) continue;
      for (const m of contents.matchAll(/href="(\/[^"#]*)"/g)) {
        expect(pages.has(m[1] ?? ""), `${rel} links ${m[1]}`).toBe(true);
      }
    }
  });

  it("says the site stores nothing and points at the app's privacy policy", () => {
    const privacy = expected.get("privacy.html") ?? "";
    expect(privacy).toContain("no forms, set no cookies");
    expect(privacy).toContain('href="https://payapps.marisstella.app/legal/privacy"');
  });

  it("refuses to drop the list before launch, when it is the site's only action", () => {
    expect(() =>
      buildSite({ siteUrl: "https://marisstella.app/payapps", appUrl: null, earlyAccess: false }),
    ).toThrow(/needs APP_URL/);
  });
});
