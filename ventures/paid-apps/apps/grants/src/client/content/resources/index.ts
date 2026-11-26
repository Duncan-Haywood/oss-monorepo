// The resources library: guides for small nonprofits, tribal and community organizations and workforce
// programs. Pages: /resources (routes/marketing/resources.tsx) and /resources/$slug
// (routes/marketing/resource-article.tsx). RESOURCE_ROUTES feeds the prerender/sitemap list.
import { pageTitle } from "@client/components/marketing/meta";
import type { PublicRoute } from "@client/marketing-routes";
import { aiDraftsHonest } from "./ai-drafts-honest";
import { documentsFundersAskFor } from "./documents-funders-ask-for";
import { funderTypes } from "./funder-types";
import { grantGlossary } from "./grant-glossary";
import { grantReporting } from "./grant-reporting";
import { needStatement } from "./need-statement";
import { samUeiGrantsGov } from "./sam-uei-grants-gov";
import type { ResourceArticle } from "./types";

export type { ResourceArticle, ResourceSource } from "./types";

/** Index order: getting ready first, then writing, then after the award. */
export const RESOURCE_ARTICLES: readonly ResourceArticle[] = [
  documentsFundersAskFor,
  samUeiGrantsGov,
  needStatement,
  funderTypes,
  grantReporting,
  aiDraftsHonest,
  grantGlossary,
];

export const RESOURCES_PATH = "/resources";

export const resourcePath = (slug: string): `/${string}` => `${RESOURCES_PATH}/${slug}`;

export const RESOURCE_SLUGS: readonly string[] = RESOURCE_ARTICLES.map((a) => a.slug);

export const RESOURCES_INDEX_META = {
  title: "Grant resources for small nonprofits",
  description:
    "Plain-language grant guides for small nonprofits, tribal and community organizations and workforce programs, from registration to reporting after the award.",
} as const;

export function getResourceArticle(slug: string): ResourceArticle | undefined {
  return RESOURCE_ARTICLES.find((a) => a.slug === slug);
}

/** The article's own `related` picks first, then the rest of the library in index order. */
export function relatedArticles(slug: string, limit = 3): ResourceArticle[] {
  const current = getResourceArticle(slug);
  const picked = (current?.related ?? [])
    .map(getResourceArticle)
    .filter((a): a is ResourceArticle => a !== undefined && a.slug !== slug);
  const rest = RESOURCE_ARTICLES.filter(
    (a) => a.slug !== slug && !picked.some((p) => p.slug === a.slug),
  );
  return [...picked, ...rest].slice(0, limit);
}

const latestUpdate = RESOURCE_ARTICLES.map((a) => a.updated)
  .sort()
  .at(-1);

/** Crawlable resource pages, in the same shape as PUBLIC_ROUTES (spread them into that list). */
export const RESOURCE_ROUTES: readonly PublicRoute[] = [
  {
    path: RESOURCES_PATH,
    title: pageTitle(RESOURCES_INDEX_META.title),
    description: RESOURCES_INDEX_META.description,
    changefreq: "monthly",
    priority: 0.6,
    ...(latestUpdate ? { lastmod: latestUpdate } : {}),
  },
  ...RESOURCE_ARTICLES.map(
    (a): PublicRoute => ({
      path: resourcePath(a.slug),
      title: pageTitle(a.title),
      description: a.description,
      changefreq: "monthly",
      priority: 0.5,
      lastmod: a.updated,
      structuredData: a.kind === "glossary" ? ["article", "glossary"] : ["article"],
    }),
  ),
];
