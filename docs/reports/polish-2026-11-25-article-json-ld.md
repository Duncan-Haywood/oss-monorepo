---
kind: polish
topics: [seo]
date: 2026-11-25
---
# Polish 2026-11-25: Article JSON-LD gets url, image, author and publisher

PR: Duncan-Haywood/oss-monorepo PR 18830. Track: polish/0, aimed at bet 1's front door
(`ventures/pay-app-guides`, `ventures/pay-application-generator`).

## What was measured

A scan of every hand-written JSON-LD block under `ventures/*/` and `ventures/*/*/`
(Python `json.loads` on each `application/ld+json` script, 2026-11-25):

| Type | Blocks | no `image` | no `publisher` | no `mainEntityOfPage` | no `url` | no `author` |
|---|---:|---:|---:|---:|---:|---:|
| Article | 81 | 81 | 81 | 81 | 80 | 42 |
| TechArticle | 16 | 16 | 16 | 16 | 16 | 9 |
| HowTo | 119 | 119 | 119 | 119 | 119 | 119 |

Every blog post's `BlogPosting` (writing.mjs) had `url` but no `image`, `author`,
`publisher` or `mainEntityOfPage`. All seven pay-app-guides pages were among the Articles.

## What changed

- `platform/pages/article-ld.mjs`: `completeArticleJsonLd` fills the five properties on
  Article, TechArticle, BlogPosting, NewsArticle, Report and ScholarlyArticle nodes (top
  level, arrays, `@graph`). It fills only what is missing and leaves unparseable blocks
  unchanged. Author and publisher are the site organisation (`<base>#organization`, the node
  `home.mjs` describes), so no person is named.
- `build.mjs` `injectDiscoveryTags` calls it last, with the page's final `og:image`
  resolved against the canonical.
- `share.mjs` `completeShareTags` calls `retargetArticleImage` when it swaps in a page's own
  card, so the JSON-LD and `og:image` always name the same picture. Before this fix, the first
  preview showed blog posts pointing their JSON-LD at the site card while `og:image` named
  the post's card.
- `writing.mjs`: posts' `BlogPosting` goes through the same helper.
- `pay-application-generator/index.html`: the meta description went from 312 characters to
  156, so the build no longer cuts it at "…the contract sum…". The description-length baseline
  went from 3,000 to 2,999.

## Checked

Preview build (`build.mjs --only=pay-app-guides,pay-application-generator`): all seven guide
pages' Article now has an absolute `url` equal to the canonical, an `image` equal to
`og:image`, and `author`/`publisher` naming `https://marisstella.app/#organization`. Test
results are in the run record.

## Not done, next

1. **HowTo (119 blocks).** Left alone on purpose. Google retired HowTo rich results in 2023,
   and a HowTo node is not an Article. If those pages are really guides, retyping them to
   Article (each with its visible steps) is a content decision for each page.
2. **No Article at all.** Many deep venture pages carry no JSON-LD. A build-time Article (or
   WebPage) for pages with an `<h1>`, a date and no JSON-LD would extend this. Measure how
   many first.
3. **`dateModified`.** Venture Articles set it by hand, and it goes stale when a page changes
   (pay-app-guides' retainage page is updated by PR 18798). A check comparing
   `dateModified` with the file's last commit would catch it.
4. Carried from earlier polish notes: 2,999 meta descriptions over 160; mid-title ellipses
   in `writing/` and `research/`.
