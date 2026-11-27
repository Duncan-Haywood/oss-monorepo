// Checks the built site the way grants' check-seo.mjs does: per-page metadata, JSON-LD, honest copy
// and the machine-readable files.
import { PLANS } from "@shared/plans";
import { NOT_AIA_NOTE, PAGE_LIST, PAGES } from "@shared/site";
import { buildSite } from "@site/build";
import { esc, html } from "@site/html";
import { htmlToMarkdown } from "@site/seo";
import { describe, expect, it } from "vitest";

const SITE = "https://marisstella.app/payapps";
const files = buildSite({ siteUrl: SITE });
const page = (file: string) => {
  const f = files.get(file);
  if (!f) throw new Error(`missing ${file}`);
  return f;
};

function jsonLdTypes(doc: string): string[] {
  const m = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(doc);
  if (!m?.[1]) return [];
  const data = JSON.parse(m[1]) as { "@graph": { "@type": string }[] };
  return data["@graph"].map((n) => n["@type"]);
}

describe("built site", () => {
  it("writes every page with a unique title, description and correct robots handling", () => {
    const titles = new Set<string>();
    for (const p of PAGE_LIST) {
      const doc = page(p.file);
      expect(doc).toContain(`<title>${esc(p.title)}</title>`);
      expect(p.description.length, p.path).toBeGreaterThanOrEqual(25);
      expect(p.description.length, p.path).toBeLessThanOrEqual(200);
      titles.add(p.title);
      if (p.indexable) {
        expect(doc).toContain(
          `<link rel="canonical" href="${SITE}${p.path === "/" ? "/" : p.path}">`,
        );
        expect(doc).not.toContain("noindex");
      } else {
        expect(doc).toContain('content="noindex, nofollow"');
      }
      expect(doc).not.toMatch(/<script(?! type="application\/ld\+json")/);
      expect(doc).not.toContain("style=");
    }
    expect(titles.size).toBe(PAGE_LIST.length);
  });

  it("links within the base path", () => {
    const home = page("index.html");
    expect(home).toContain('href="/payapps/pricing"');
    expect(home).toContain('href="/payapps/styles.css"');
    expect(page("early-access.html")).toContain('action="/payapps/api/early-access"');
  });

  it("adds structured data without offers or ratings", () => {
    expect(jsonLdTypes(page("index.html"))).toEqual([
      "WebPage",
      "WebSite",
      "SoftwareApplication",
      "FAQPage",
    ]);
    expect(jsonLdTypes(page("pricing.html"))).toEqual(["WebPage", "BreadcrumbList", "FAQPage"]);
    for (const doc of files.values()) {
      expect(doc).not.toMatch(/aggregateRating|AggregateRating|"review"/);
    }
  });

  it("keeps the copy honest", () => {
    for (const [file, doc] of files) {
      if (!file.endsWith(".html")) continue;
      expect(doc, file).toContain("in development");
      expect(doc, file).not.toMatch(
        /testimonial|trusted by|customers love|\d+\+? (contractors|customers|subs) /i,
      );
    }
    expect(page("index.html")).toContain(esc(NOT_AIA_NOTE));
    expect(page("features.html")).toContain(esc(NOT_AIA_NOTE));
    for (const p of PLANS) expect(page("pricing.html")).toContain(`$${p.priceCents / 100}`);
  });

  it("writes sitemap, robots, llms.txt, llms-full.txt and the feed", () => {
    const sitemap = page("sitemap.xml");
    for (const p of PAGE_LIST) {
      const loc = `<loc>${SITE}${p.path === "/" ? "/" : p.path}</loc>`;
      if (p.indexable) expect(sitemap).toContain(loc);
      else expect(sitemap).not.toContain(loc);
    }
    const robots = page("robots.txt");
    expect(robots).toContain("Disallow: /payapps/api/");
    expect(robots).toContain("User-agent: ClaudeBot");
    expect(robots).toContain(`Sitemap: ${SITE}/sitemap.xml`);

    const llms = page("llms.txt");
    expect(llms).toMatch(/^# PayPencil\n\n> /);
    expect(llms).toContain(`(${SITE}${PAGES.pricing.path})`);
    expect(llms).toContain("not available yet");

    const full = page("llms-full.txt");
    expect(full).toContain("# Simple monthly plans, sized by active jobs");
    expect(full).toContain("(https://marisstella.app/payapps/early-access)");
    expect(full.replace(/<!-- [^>]* -->/g, "")).not.toContain("<");

    expect(page("feed.xml")).toContain('<feed xmlns="http://www.w3.org/2005/Atom">');
  });
});

describe("html helpers", () => {
  it("escapes interpolations but not nested Html", () => {
    const inner = html`<b>${"<x>"}</b>`;
    expect(html`<p>${inner}${["a", "&"]}</p>`.__html).toBe("<p><b>&lt;x&gt;</b>a&amp;</p>");
  });

  it("turns our markup into Markdown", () => {
    expect(
      htmlToMarkdown(
        '<h2>Hi</h2><p>A <a href="/x">link</a> &amp; <strong>bold</strong></p><ul><li>one</li></ul>',
      ),
    ).toBe("## Hi\n\nA [link](/x) & **bold**\n\n- one");
  });

  it("cannot be tricked into leaving a tag by nesting one inside another", () => {
    const md = htmlToMarkdown("<p>a<scr<script>x</script>ipt>alert(1)</script>b</p><<b>script>");
    expect(md).not.toMatch(/[<>]/);
    expect(md).not.toContain("alert(1)</");
  });
});
