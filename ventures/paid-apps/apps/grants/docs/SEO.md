# Search and answer-engine optimisation (SEO / AEO)

Everything public is built by `scripts/prerender.mjs` from `PUBLIC_ROUTES`
(`src/client/marketing-routes.ts`) and checked by `scripts/check-seo.mjs` (`pnpm build && pnpm check:seo`).
Copy rule for every surface below: honest summaries only, no invented stats, reviews or ratings.

## What the build writes

| File | For | Notes |
| --- | --- | --- |
| `<page>.html` | browsers, search engines | Per-page title, description, canonical, OG/Twitter tags, JSON-LD |
| `sitemap.xml` | search engines | Every prerendered page; `<lastmod>` from guide/legal dates |
| `robots.txt` | crawlers | `*` plus named groups for AI search/answer crawlers (GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, Claude-User, PerplexityBot, Google-Extended, Applebot-Extended, Bingbot, DuckAssistBot, CCBot), all allowed on public pages, all disallowed on app/API paths (`AI_CRAWLERS` in prerender.mjs) |
| `llms.txt` | language models | [llmstxt.org](https://llmstxt.org) format: summary, then annotated links to product pages, guides and policies |
| `llms-full.txt` | language models | Text of the product pages (their `<main>` only) and every guide in Markdown |
| `resources/<slug>.md` | language models, agents | Each guide as Markdown with absolute links and sources; pages link it with `<link rel="alternate" type="text/markdown">` |
| `resources/feed.xml` | feed readers, aggregators | Atom feed of the guides; every page links it |

## Structured data (JSON-LD)

- Every page: `WebPage`; below the home page also `BreadcrumbList` (Home › section › page).
- `/`: `Organization`, `WebSite`, `SoftwareApplication` (category, audience, `AggregateOffer` price range from the
  purchasable plans; no ratings, since there are no real reviews).
- `/pricing`: `Product` with one `Offer` per plan. `/faq`: `FAQPage` built from the rendered `<details>`.
- Guides: `Article` (headline, `dateModified`, reading time, publisher, sources as `citation`).
- The glossary (`kind: "glossary"`): `DefinedTermSet` built from the rendered `<h3>` terms, so it always
  matches the visible page.

## Answer-engine writing habits for new guides

- One question per heading, answered in the first sentence under it; definitions as `### Term` + paragraph.
- Every rule or number traceable to a source in `sources` (official pages first); "check the current rule"
  where amounts change.
- Link related guides with site paths (`/resources/<slug>`): the Markdown copies make them absolute.

## Hosting note

The app is moving to `https://marisstella.app/grants` (owner, 2026-11-24). Only the host root's `robots.txt` is
read by crawlers, so once the move ships the root `robots.txt` (built by the portfolio site in the public
`oss-monorepo`, `platform/pages/build.mjs`, `HOSTED_APPS`) carries the app's disallow lines and names
`/grants/sitemap.xml`; the app's own `robots.txt` is then informational.
