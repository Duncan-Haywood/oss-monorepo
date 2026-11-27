// The site's Terms, Refund Policy and Acceptable Use pages: the same text the app makes a customer
// accept (apps/payapps/docs/legal/*.md), rendered safely, linked from every page and from pricing.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LEGAL_PAGES, type LegalPageKey, PAGES } from "@shared/site";
import { buildSite } from "@site/build";
import { catalogueFiles } from "@site/catalogue";
import { legalDoc } from "@site/legal";
import { SITE_LEGAL_MARKDOWN } from "@site/legal-docs";
import { APP_LEGAL_DIR, SITE_LEGAL_KEYS } from "@site/legal-source";
import { inline, markdownToHtml, safeHref } from "@site/markdown";
import { describe, expect, it } from "vitest";

const KEYS = Object.keys(LEGAL_PAGES) as LegalPageKey[];
const site = catalogueFiles();

describe("legal documents", () => {
  it("are the app's own documents, unchanged (run `pnpm sync:legal`)", () => {
    expect(Object.keys(SITE_LEGAL_MARKDOWN).sort()).toEqual([...SITE_LEGAL_KEYS].sort());
    for (const key of SITE_LEGAL_KEYS) {
      const onDisk = readFileSync(join(APP_LEGAL_DIR, `${key}.md`), "utf8");
      expect(SITE_LEGAL_MARKDOWN[key], `${key}.md drifted: pnpm sync:legal`).toBe(onDisk);
    }
  });

  it("name the operator and a version date", () => {
    for (const key of KEYS) {
      const doc = legalDoc(key);
      expect(doc.operator).toBe("Maris Stella Labs LLC");
      expect(doc.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe("legal pages", () => {
  it("are written, indexable, in the sitemap and in llms.txt", () => {
    const sitemap = site.get("sitemap.xml") ?? "";
    const llms = site.get("llms.txt") ?? "";
    for (const key of KEYS) {
      const page = PAGES[key];
      const out = site.get(page.file) ?? "";
      expect(out, page.file).toContain(`<h1>${legalDoc(key).title}</h1>`);
      expect(out).toContain(
        `<link rel="canonical" href="https://marisstella.app/payapps${page.path}">`,
      );
      expect(sitemap).toContain(`https://marisstella.app/payapps${page.path}</loc>`);
      expect(llms).toContain(page.path);
    }
  });

  it("carry each document's sections and its contact line", () => {
    const terms = site.get("terms.html") ?? "";
    expect(terms).toContain("<h2>1. Who we are</h2>");
    expect(terms).toContain("<h2>14. Governing law</h2>");
    expect(terms).toContain("<strong>State of Colorado</strong>");
    expect(terms).toContain('<a href="mailto:hello@marisstella.app">hello@marisstella.app</a>');
    const refunds = site.get("refunds.html") ?? "";
    expect(refunds).toContain("<h2>30-day money-back guarantee</h2>");
    expect(refunds).toContain("<strong>full refund within 30 days</strong>");
    expect(site.get("acceptable-use.html")).toContain("<strong>false or inflated</strong>");
    // The version line becomes the lede; it is not repeated in the body.
    expect(terms.match(/Version 2026-/g)?.length).toBe(1);
  });

  it("link to the app's copy, which asks for acceptance", () => {
    expect(site.get("refunds.html")).toContain(
      'href="https://payapps.marisstella.app/legal/refunds"',
    );
    expect(site.get("acceptable-use.html")).toContain(
      'href="https://payapps.marisstella.app/legal/acceptable-use"',
    );
  });

  it("are linked from every page's footer and from the pricing note", () => {
    for (const [rel, contents] of site) {
      if (!rel.endsWith(".html")) continue;
      expect(contents, rel).toContain('<a href="/payapps/terms">Terms</a>');
      expect(contents, rel).toContain('<a href="/payapps/refunds">Refunds</a>');
    }
    expect(site.get("pricing.html")).toContain(
      'full refund within 30 days of your first paid payment (<a href="/payapps/refunds">Refund Policy</a>)',
    );
  });

  it("are built by the Worker's site too, with the early-access list", () => {
    const withList = buildSite({ siteUrl: "https://marisstella.app/payapps" });
    for (const key of KEYS) expect(withList.has(PAGES[key].file)).toBe(true);
  });
});

describe("markdown renderer", () => {
  it("escapes raw HTML and drops unsafe links", () => {
    expect(inline('<script>alert(1)</script> & "x"')).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;",
    );
    expect(inline("[x](javascript:alert(1))")).not.toContain("href");
    expect(inline("[x](https://example.com/a)")).toBe('<a href="https://example.com/a">x</a>');
    expect(safeHref("java\tscript:alert(1)")).toBeNull();
    expect(safeHref("//evil.example")).toBeNull();
    expect(inline("**bold** and *it* and `c<d`")).toBe(
      "<strong>bold</strong> and <em>it</em> and <code>c&lt;d</code>",
    );
  });

  it("renders headings, paragraphs and lists, joining wrapped lines", () => {
    const out = markdownToHtml("# T\n\n## A\n\nOne\ntwo.\n\n- x\n  more\n- y\n", {
      dropTitle: true,
    });
    expect(out).toBe("<h2>A</h2>\n<p>One two.</p>\n<ul><li>x more</li><li>y</li></ul>");
  });

  it("refuses syntax it does not render, so a document edit cannot publish broken markup", () => {
    expect(() => markdownToHtml("| a | b |\n| --- | --- |")).toThrow(/does not render line 1/);
    expect(() => markdownToHtml("1. one")).toThrow(/does not render/);
    expect(() => markdownToHtml("> quote")).toThrow(/does not render/);
  });
});
