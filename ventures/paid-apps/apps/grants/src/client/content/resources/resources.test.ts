import { describe, expect, it } from "vitest";
import {
  getResourceArticle,
  RESOURCE_ARTICLES,
  RESOURCE_ROUTES,
  RESOURCE_SLUGS,
  relatedArticles,
} from ".";
import { countWords, readingMinutesFor } from "./types";

describe("resources library content", () => {
  it("has seven articles with unique, URL-safe slugs and unique titles", () => {
    expect(RESOURCE_ARTICLES).toHaveLength(7);
    expect(new Set(RESOURCE_SLUGS).size).toBe(RESOURCE_ARTICLES.length);
    expect(new Set(RESOURCE_ARTICLES.map((a) => a.title)).size).toBe(RESOURCE_ARTICLES.length);
    for (const slug of RESOURCE_SLUGS) expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it.each(RESOURCE_ARTICLES.map((a) => [a.slug, a] as const))("%s is well formed", (_, a) => {
    expect(a.updated).toMatch(/^2026-11-(19|24)$/);
    const words = countWords(a.body);
    expect(words).toBeGreaterThanOrEqual(800);
    expect(words).toBeLessThanOrEqual(1400);
    expect(a.readingMinutes).toBe(readingMinutesFor(a.body));
    expect(a.description.length).toBeGreaterThanOrEqual(70);
    expect(a.description.length).toBeLessThanOrEqual(160);
    // The page renders the h1; bodies start at "##".
    expect(a.body).not.toMatch(/^# /m);
    expect(a.body).toMatch(/^## /m);

    expect(a.sources.length).toBeGreaterThan(0);
    for (const s of a.sources) {
      expect(s.title.trim()).not.toBe("");
      expect(s.url).toMatch(/^(https:\/\/[^/\s]+\/?\S*|\/[a-z0-9/-]*)$/);
    }
    expect(new Set(a.sources.map((s) => s.url)).size).toBe(a.sources.length);

    // Links between guides must point at real articles.
    for (const [, slug] of a.body.matchAll(/\]\(\/resources\/([^)#\s]+)\)/g)) {
      expect(RESOURCE_SLUGS).toContain(slug);
    }
    for (const slug of a.related ?? []) {
      expect(slug).not.toBe(a.slug);
      expect(RESOURCE_SLUGS).toContain(slug);
    }
  });

  it("writes the glossary as ### terms, each followed by a definition paragraph", () => {
    const glossary = RESOURCE_ARTICLES.find((a) => a.kind === "glossary");
    if (!glossary) throw new Error("no glossary");
    const terms = [...glossary.body.matchAll(/^### (.+)\n\n(.+)$/gm)];
    expect(terms.length).toBeGreaterThanOrEqual(20);
    expect(glossary.body.match(/^### /gm)?.length).toBe(terms.length);
    expect(RESOURCE_ROUTES.find((r) => r.path.endsWith(glossary.slug))?.structuredData).toEqual([
      "article",
      "glossary",
    ]);
  });

  it("never uses placeholder domains the SEO check rejects", () => {
    const placeholder = /localhost|[a-z0-9-]+\.example\b|\bexample\.(?:com|org|net)\b|@example\b/i;
    for (const a of RESOURCE_ARTICLES) {
      expect(`${a.body} ${a.description}`).not.toMatch(placeholder);
      for (const s of a.sources) expect(s.url).not.toMatch(placeholder);
    }
  });

  it("looks articles up by slug and suggests three related ones", () => {
    const [first] = RESOURCE_ARTICLES;
    if (!first) throw new Error("no articles");
    expect(getResourceArticle(first.slug)).toBe(first);
    expect(getResourceArticle("nope")).toBeUndefined();
    const related = relatedArticles(first.slug);
    expect(related).toHaveLength(3);
    expect(related.map((a) => a.slug)).not.toContain(first.slug);
    expect(related.map((a) => a.slug).slice(0, first.related?.length ?? 0)).toEqual(
      (first.related ?? []).slice(0, 3),
    );
    expect(relatedArticles("nope")).toHaveLength(3);
  });

  it("exports crawlable routes for the index and every article", () => {
    expect(RESOURCE_ROUTES.map((r) => r.path)).toEqual([
      "/resources",
      ...RESOURCE_SLUGS.map((s) => `/resources/${s}`),
    ]);
    expect(new Set(RESOURCE_ROUTES.map((r) => r.title)).size).toBe(RESOURCE_ROUTES.length);
    for (const r of RESOURCE_ROUTES) {
      expect(r.title).toMatch(/ · Grant Autopilot$/);
      expect(r.description.length).toBeLessThanOrEqual(160);
      expect(r.lastmod).toMatch(/^2026-11-(19|24)$/);
    }
  });
});
