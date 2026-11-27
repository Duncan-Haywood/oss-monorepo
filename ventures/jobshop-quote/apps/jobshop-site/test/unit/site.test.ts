// The SEO/AEO contract (same checks as apps/grants' scripts/check-seo.mjs) plus the copy rules.
import { AI_CRAWLERS, buildSite, fileFor, mainText, resolveBuildOptions } from "@site/build";
import { CMMC_SITE_URL, LAUNCH, type Launch } from "@site/config";
import { esc } from "@site/html";
import { statusLine } from "@site/layout";
import { AI_OFF } from "@site/pages";
import { PUBLIC_ROUTES, publicRoutes } from "@site/routes";
import { describe, expect, it } from "vitest";

const SITE = "https://example.test/jobshop";
const APP = "https://app.example.test";
/** The state the tests pin: open, nothing optional switched on (the launch state on 2026-11-27). */
const OPEN: Launch = {
  appUrl: APP,
  open: true,
  aiReading: false,
  inboundEmail: false,
  paidPlans: false,
};
const CLOSED: Launch = { ...OPEN, appUrl: null, open: false };
const files = buildSite({ siteUrl: SITE, basePath: "/jobshop", launch: OPEN });
const PUBLIC_ROUTES_OPEN = publicRoutes(OPEN);
const pages = PUBLIC_ROUTES_OPEN.map((r) => ({ route: r, html: files.get(fileFor(r.path)) ?? "" }));

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
    for (const routes of [publicRoutes(OPEN), publicRoutes(CLOSED)]) {
      expect(new Set(routes.map((r) => r.title)).size).toBe(routes.length);
      expect(new Set(routes.map((r) => r.description)).size).toBe(routes.length);
    }
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
      ...PUBLIC_ROUTES_OPEN.map((r) => `/jobshop${r.path === "/" ? "/" : r.path}`),
      "/jobshop/styles.css",
      "/jobshop/favicon.svg",
    ]);
    for (const p of pages) {
      for (const [, href] of p.html.matchAll(/(?:href|action)="(\/[^"#]*)/g)) {
        expect(known.has(href ?? ""), `${p.route.path} links to ${href}`).toBe(true);
      }
    }
  });

  it("has no early-access pages, form or API once open: sign-up is in the app", () => {
    for (const [rel, contents] of files) {
      expect(rel).not.toMatch(/early-access/);
      expect(contents, rel).not.toMatch(
        /(?:href|action)="[^"]*early-access|<form|Request early access/,
      );
    }
    for (const p of pages) {
      expect(p.html, p.route.path).toContain(`href="${APP}/sign-up"`);
      expect(p.html, p.route.path).toContain(`href="${APP}/sign-in"`);
    }
  });

  it("refuses an open site with no app to sign up in", () => {
    expect(() => publicRoutes({ ...OPEN, appUrl: null })).toThrow(/appUrl/);
  });

  it("builds the current launch switch", () => {
    expect(PUBLIC_ROUTES).toEqual(publicRoutes(LAUNCH));
  });
});

describe("closed site (before launch)", () => {
  const closed = buildSite({ siteUrl: SITE, basePath: "/jobshop", launch: CLOSED });
  const closedPages = publicRoutes(CLOSED).map((r) => ({
    route: r,
    html: closed.get(fileFor(r.path)) ?? "",
  }));

  it("says it's in development on every page and offers the early-access list", () => {
    for (const p of closedPages) {
      expect(p.html).toContain("In development");
      expect(p.html).toContain('href="/jobshop/early-access"');
      expect(p.html).not.toContain(APP);
    }
  });

  it("keeps the noindex thank-you page out of the sitemap and llms.txt", () => {
    const thanks = closed.get("early-access/thanks.html") ?? "";
    expect(thanks).toContain('<meta name="robots" content="noindex">');
    expect(closed.get("sitemap.xml")).not.toContain("/early-access/thanks");
    expect(closed.get("llms.txt")).not.toContain("/early-access/thanks");
  });
});

describe("copy rules (README: honesty)", () => {
  const all = pages
    .map((p) => mainText(p.html))
    .join("\n")
    .toLowerCase();

  it("states what is open on every page", () => {
    const line = statusLine({ basePath: "/jobshop", launch: OPEN });
    expect(line).toContain("paid plans not on sale yet");
    for (const p of pages) expect(p.html).toContain(line);
    for (const p of pages) expect(p.html).not.toContain("In development");
  });

  it("says AI reading is off wherever it describes it, while it is off", () => {
    for (const path of ["/how-it-works", "/faq"]) {
      expect(pages.find((p) => p.route.path === path)?.html).toContain(esc(AI_OFF));
    }
    const home = mainText(pages.find((p) => p.route.path === "/")?.html ?? "");
    expect(home).toContain("Not switched on yet: reading RFQ emails and drawings with AI");
    expect(home).not.toMatch(/Forward an RFQ email or drop in a PDF drawing/);
    expect(files.get("llms.txt")).toContain("not switched on in the hosted app yet");
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
    expect(pricing).toContain("they are not on sale yet");
    expect((pricing.match(/Not on sale yet\./g) ?? []).length).toBeGreaterThanOrEqual(2);
    const closedPricing = buildSite({ siteUrl: SITE, basePath: "", launch: CLOSED }).get(
      "pricing.html",
    );
    expect(closedPricing).toContain("Nothing is for sale yet");
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
    for (const r of PUBLIC_ROUTES_OPEN.filter((x) => !x.noindex))
      expect(sm).toContain(`<loc>${SITE}${r.path === "/" ? "/" : r.path}</loc>`);
  });

  it("llms.txt follows llmstxt.org: H1, blockquote summary, linked sections", () => {
    const llms = files.get("llms.txt") ?? "";
    expect(llms).toMatch(/^# Job Shop Quote\n\n> /);
    expect(llms).toContain(`- [Sign up](${APP}/sign-up)`);
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
