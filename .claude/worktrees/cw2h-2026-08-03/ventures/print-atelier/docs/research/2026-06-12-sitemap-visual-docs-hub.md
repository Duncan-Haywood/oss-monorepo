# Sitemap + Visual Docs Hub — 2026-06-12

## Sources

- [Google Search Central — Sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview)
- [Next.js Metadata — sitemap.js](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap)
- Internal: `docs/research/2026-06-12-print-routes-payout-metadata.md` (consent-gated publish model)

## Strategic implication

Programmatic SEO is only market-ready when the **same consent gate** that blocks `noindex` print pages also drives `sitemap.xml`. A visual docs hub gives owners and investors one entry point to investor metrics, battlecards, SEO lab, catalog AI, and payout simulation before scaling ad spend or artist outreach.

## Implementation notes

- `buildSitemapEntries` includes static market routes (`/`, `/docs`, `/investor`, `/storefront`, `/artist-portal`, `/capture`) plus only `getPublishableSeoSlugs()` print paths.
- `robots.txt` disallows `/admin-portal` and `/ops`; references `/sitemap.xml`.
- `/docs` visual hub surfaces live metrics from shared libs (launch score, publishable SEO count, metadata confidence).
