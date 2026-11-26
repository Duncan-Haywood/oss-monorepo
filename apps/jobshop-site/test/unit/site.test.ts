// The SEO/AEO contract (same checks as apps/grants' scripts/check-seo.mjs) plus the copy rules.
import {
  AI_CRAWLERS,
  buildSite,
  fileFor,
  mainText,
  removeAll,
  resolveBuildOptions,
} from "@site/build";
import { CMMC_SITE_URL } from "@site/config";
import { esc } from "@site/html";
import { PUBLIC_ROUTES } from "@site/routes";
import { describe, expect, it } from "vitest";

const SITE = "https://example.test/jobshop";
const files = buildSite({ siteUrl: SITE, basePath: "/jobshop" });
const pages = PUBLIC_ROUTES.map((r) => ({ route: r, html: files.get(fileFor(r.path)) ?? "" }));

function jsonLd(html: string): { "@graph": Record<string, unknown>[] } {
  const m = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
  if (!m?.[1]) throw new Error("no JSON-LD");
  return JSON.parse(m[1]);
}
const types = (html: string) => jsonLd(html)["@graph"].map((n) => n["@type"]);

describe("prerendered pages", () => {
  it.each(pages.map((p) => [p.route.path, p] as const))("%s has complete head tags", (path, p) => {
    const url = path === "/" ? `${SITE}/` : `${SITE}${path}`;
    expect(p.html).toContain(`<title>${p.route.title.replace(/&/g, "&amp;")}</title>`);
    expect(p.html).toContain(`<link rel="canonical" href="${url}">`);
    expect(p.html).toContain(`<meta property="og:url" content="${url}">`);
    expect(p.html).toContain(`<meta property="og:image" content="${SITE}/og.png">`);
    expect(p.html).toMatch(/<meta name="description" content="[^"]{70,170}">/);
    expect(p.html.match(/<h1\b/g)).toHaveLength(1);
    expect(types(p.html)).toContain("WebPage");
    if (path !== "/") expect(types(p.html)).toContain("BreadcrumbList");
  });

  it("uses unique titles and descriptions", () => {
    expect(new Set(PUBLIC_ROUTES.map((r) => r.title)).size).toBe(PUBLIC_ROUTES.length);
    expect(new Set(PUBLIC_ROUTES.map((r) => r.description)).size).toBe(PUBLIC_ROUTES.length);
  });

  it("adds the structured data each route asks for", () => {
    const get = (path: string) => pages.find((p) => p.route.path === path)?.html ?? "";
    expect(types(get("/"))).toEqual(
      expect.arrayContaining(["Organization", "WebSite", "SoftwareApplication"]),
    );
    expect(types(get("/pricing"))).toContain("Product");
    const faq = jsonLd(get("/faq"))["@graph"].find((n) => n["@type"] === "FAQPage") as {
      mainEntity: { name: string }[];
    };
    // Every question in the JSON-LD is visible on the page.
    for (const q of faq.mainEntity)
      expect(get("/faq")).toContain(`<summary>${esc(q.name)}</summary>`);
    expect(faq.mainEntity.length).toBe((get("/faq").match(/<summary>/g) ?? []).length);
  });

  it("never marks up ratings, reviews or paid offers", () => {
    for (const p of pages) {
      expect(p.html).not.toMatch(/AggregateRating|"Review"|ratingValue/);
      for (const n of jsonLd(p.html)["@graph"]) {
        const offers = (n.offers ?? []) as { price: string }[];
        for (const o of offers) expect(o.price).toBe("0");
      }
    }
  });

  it("prefixes every internal link with the base path", () => {
    for (const p of pages) {
      for (const [, href] of p.html.matchAll(/(?:href|action)="([^"]+)"/g)) {
        if (/^(https?:|mailto:|#)/.test(href ?? "")) continue;
        expect(href, `${p.route.path}: ${href}`).toMatch(/^\/jobshop\//);
      }
    }
  });

  it("links only to pages that exist", () => {
    const known = new Set([
      ...PUBLIC_ROUTES.map((r) => `/jobshop${r.path === "/" ? "/" : r.path}`),
      "/jobshop/styles.css",
      "/jobshop/favicon.svg",
      "/jobshop/api/early-access",
    ]);
    for (const p of pages) {
      for (const [, href] of p.html.matchAll(/(?:href|action)="(\/[^"#]*)/g)) {
        expect(known.has(href ?? ""), `${p.route.path} links to ${href}`).toBe(true);
      }
    }
  });

  it("keeps the noindex thank-you page out of the sitemap and llms.txt", () => {
    const thanks = pages.find((p) => p.route.path === "/early-access/thanks")?.html ?? "";
    expect(thanks).toContain('<meta name="robots" content="noindex">');
    expect(files.get("sitemap.xml")).not.toContain("/early-access/thanks");
    expect(files.get("llms.txt")).not.toContain("/early-access/thanks");
  });
});

describe("mainText (llms-full.txt)", () => {
  it("strips tags to a fixpoint, so a nested tag cannot reassemble into <script>", () => {
    expect(removeAll("<<b>script>x", /<[^>]+>/g)).toBe("script>x");
    const text = mainText("<main><p>a <<b>script>alert(1)<</b>/script> b</p></main>");
    expect(text).not.toContain("<");
    expect(mainText("<main><FORM><fo<form></form>rm></FORM >after</main>")).toBe("rm>after");
  });

  it("decodes &amp; last, so an escaped entity stays text", () => {
    expect(mainText("<main><p>&amp;lt;script&amp;gt; R&amp;D</p></main>")).toBe(
      "&lt;script&gt; R&D",
    );
  });
});

describe("copy rules (README: honesty)", () => {
  const all = pages
    .map((p) => mainText(p.html))
    .join("\n")
    .toLowerCase();

  it("says it's in development on every page", () => {
    for (const p of pages) expect(p.html).toContain("In development");
  });

  it("makes no customer, testimonial, rating or time-saved claims", () => {
    expect(all).not.toMatch(
      /trusted by|\bour customers\b|testimonial from|\d+\s?(?:%|x|×) faster|hours saved|saves? \d+/,
    );
    expect(all).not.toMatch(/\bcertified\b|\bcompliant\b|fedramp authorized|itar[- ]registered/);
  });

  it("labels the CMMC product as coming", () => {
    const cmmc = pages.find((p) => p.route.path === "/for-cmmc-shops")?.html ?? "";
    expect(cmmc).toContain(`href="${CMMC_SITE_URL}">The CMMC workspace (coming)</a>`);
    for (const p of pages) {
      for (const m of p.html.matchAll(new RegExp(`href="${CMMC_SITE_URL}">([^<]*)<`, "g")))
        expect(m[1]).toMatch(/coming/i);
    }
  });

  it("shows proposed prices as not on sale", () => {
    const pricing = pages.find((p) => p.route.path === "/pricing")?.html ?? "";
    expect(pricing).toContain("$199");
    expect(pricing).toContain("Nothing is for sale yet");
    expect((pricing.match(/Not on sale yet\./g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

describe("answer-engine files", () => {
  it("robots.txt allows public pages for named AI crawlers and blocks the API", () => {
    const robots = files.get("robots.txt") ?? "";
    for (const bot of AI_CRAWLERS) expect(robots).toContain(`User-agent: ${bot}\nAllow: /jobshop/`);
    expect(robots).toContain("Disallow: /jobshop/api");
    expect(robots).toContain(`Sitemap: ${SITE}/sitemap.xml`);
  });

  it("sitemap lists every indexable page", () => {
    const sm = files.get("sitemap.xml") ?? "";
    for (const r of PUBLIC_ROUTES.filter((x) => !x.noindex))
      expect(sm).toContain(`<loc>${SITE}${r.path === "/" ? "/" : r.path}</loc>`);
  });

  it("llms.txt follows llmstxt.org: H1, blockquote summary, linked sections", () => {
    const llms = files.get("llms.txt") ?? "";
    expect(llms).toMatch(/^# RFQ Desk\n\n> /);
    expect(llms).toContain(`- [Pricing](${SITE}/pricing): `);
    expect(llms).toContain("no customers yet");
  });

  it("llms-full.txt carries page text, not markup or the form", () => {
    const full = files.get("llms-full.txt") ?? "";
    expect(full).toContain("## How it works");
    expect(full).not.toMatch(/<[a-z]/i);
    expect(full).not.toContain("Leave this empty");
  });
});

describe("resolveBuildOptions", () => {
  it("defaults to the production URL at the host root", () => {
    expect(resolveBuildOptions({})).toEqual({
      siteUrl: "https://marisstella.app/jobshop",
      basePath: "",
    });
  });
  it("normalises BASE_PATH and rejects odd values", () => {
    expect(resolveBuildOptions({ BASE_PATH: "jobshop/" }).basePath).toBe("/jobshop");
    expect(() => resolveBuildOptions({ BASE_PATH: "/../x" })).toThrow();
    expect(() => resolveBuildOptions({ SITE_URL: "ftp://x" })).toThrow();
  });
});
