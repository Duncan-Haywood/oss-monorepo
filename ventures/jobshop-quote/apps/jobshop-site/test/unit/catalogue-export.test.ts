// catalogue-export/ is the committed static copy the catalogue serves at marisstella.app/jobshop/
// (src/site/catalogue.ts). It must be exactly what the current pages, plans and launch switch build.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { CATALOGUE_EXPORT_DIR, catalogueFiles } from "@site/catalogue";
import { appLink, LAUNCH } from "@site/config";
import { describe, expect, it } from "vitest";

function onDisk(dir: string): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.set(relative(dir, p).split("\\").join("/"), readFileSync(p));
    }
  };
  walk(dir);
  return out;
}

const expected = catalogueFiles();
const text = [...expected].filter((e): e is [string, string] => typeof e[1] === "string");

describe("catalogue export", () => {
  it("matches the build (run `pnpm export:catalogue` after changing the site)", () => {
    const actual = onDisk(CATALOGUE_EXPORT_DIR);
    expect([...actual.keys()].sort()).toEqual([...expected.keys()].sort());
    for (const [rel, contents] of expected) {
      const want = typeof contents === "string" ? Buffer.from(contents, "utf8") : contents;
      expect(
        actual.get(rel)?.equals(want),
        `catalogue-export/${rel} is stale: pnpm export:catalogue`,
      ).toBe(true);
    }
  });

  it("has no early-access pages, form or API links, since no Worker is behind it", () => {
    for (const [rel, contents] of text) {
      expect(rel).not.toMatch(/early-access/);
      expect(contents, rel).not.toMatch(/(?:href|action)="[^"]*(?:early-access|\/api\/)|<form/);
    }
  });

  it("links only to pages it contains, or to the app", () => {
    const pages = new Set([...expected.keys()].map((f) => `/jobshop/${f.replace(/\.html$/, "")}`));
    pages.add("/jobshop/");
    for (const [rel, contents] of text) {
      if (!rel.endsWith(".html")) continue;
      for (const m of contents.matchAll(/href="(\/[^"#]*)"/g)) {
        expect(pages.has(m[1] ?? ""), `${rel} links ${m[1]}`).toBe(true);
      }
      expect(contents, rel).toContain(`href="${appLink(LAUNCH, "/sign-up")}"`);
    }
  });

  it("says the site stores nothing and points at the app's privacy policy", () => {
    const privacy = (expected.get("privacy.html") as string) ?? "";
    expect(privacy).toContain("no forms, set no cookies");
    expect(privacy).toContain(`href="${appLink(LAUNCH, "/legal/privacy")}"`);
  });
});
