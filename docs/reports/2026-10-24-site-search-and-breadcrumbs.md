# Site search reaches guides, comparisons and posts; every tool page declares its breadcrumb

**Date:** 2026-10-24. **Asked by:** the owner ("increase the navigabiltiy and
seo and searchability and organization of the ghp website further").
**Method:** built the site in a cloud session, audited all 4,238 built pages
with a throwaway script (titles, descriptions, canonicals, H1s, JSON-LD,
breadcrumbs, inbound links), fixed the two largest gaps, and checked the
result with the Pages test suite, `check.mjs`, the same ranking code the hub
runs, and a headless Chromium session on the built hub. Every number below
comes from a build in that session.

## What the audit found

| Check (4,231 indexable pages) | Before | After |
|---|---|---|
| Pages with no `BreadcrumbList` | 1,756 | 82 (the hub and site section indexes, which are one level deep) |
| Search-index entries that are guide or comparison pages | 0 of 2,353 | 1,451 |
| Search-index entries that are blog posts | 0 | 72 |
| Search-index entries for `/compare/` and `c/` collection pages | 0 | 89 |
| Missing title / canonical / site header | 0 / 0 / 0 | unchanged |
| Pages with no inbound link | 1 (`lab/handoff/`, reached from the lab's own nav script) | unchanged |
| Titles over 65 characters | 2,623 | unchanged, see "Not done" |

The duplicate-description and missing-description counts the first pass
reported were the audit script's regex stopping at an apostrophe; on a second
look none were real.

## 1. Breadcrumb markup matches the visible trail

Every venture page has shown "Home › category › tool › page" in its header
since the shared site header landed (`site-nav.mjs`). The structured data said
something else: entry pages declared "Open Tools and Research › tool" (no
category), and the ~1,750 guide and comparison pages inside tools declared
nothing, on the grounds, written in `injectChrome` and pinned by a test, that
"a deep SEO page inside a tool is not a third level of the site". The visible
trail had since made it one. Search engines ask that breadcrumb markup
describe the trail on the page, and a result showing "Open Tools and Research
› Compliance checks › 1099-K Threshold Checker" is more legible than a URL.

`injectChrome` now builds the crumb list once and renders both the visible
trail and the `BreadcrumbList` from it. A page that wrote its own
`BreadcrumbList` keeps it. A deep page with no title of its own gets no markup
(the visible fallback label is "This page", which is a useless result name).
Blog posts (`writing.mjs`) got the same treatment for their "Home › Blog
[› Agent to agent]" trail.

The old test, "breadcrumbs go on entry pages only", was replaced by "every
tool page declares the breadcrumb trail it shows", which compares the JSON-LD
names against the visible trail on every published tool page.

## 2. Search finds the page that answers the query

The hub's search index (`search-index.json`) listed tools and research
projects only. Guide titles were folded into their tool's tokens
(`collectPageTitles`), so "why is my 1099-k higher" found the 1099-K
Reconciliation Worksheet, and the visitor then had to find the one guide among
the tool's pages that answers it. Now each guide is its own result, along with
blog posts and the `c/` and `/compare/` collection pages.

Ranking, from the hub's own `searchScore` over the built index:

| Query | First result before | First result now |
|---|---|---|
| why is my 1099-k higher | the worksheet tool | the guide "Why Is My 1099-K Higher Than What I Actually Made?" (tool second) |
| how much to charge for crown molding | the tool | the guide of that name (tool second) |
| should I use amazon awd | the FBA tool | the guide "Should I use Amazon Warehousing and Distribution?" |
| jobber | an arbitrary bid calculator | "Jobber alternatives: 43 free tools" (`compare/jobber/`) |
| zizmor | a CLI check | `compare/zizmor/` |
| guidelines not rules | no match (only the approximate "closest" list) | the blog post |
| pid controller | research projects | the blog post, then the research projects |
| ebay fee / roofing / 1099-k threshold | the tool | the tool (unchanged: guides are listed after every tool, so a tie goes to the tool) |

Two design choices:

- **Templated "vs" pages are not listed one by one.** The first version listed
  every guide and "jobber" returned 86 rows reading "This calculator vs.
  Jobber". A "vs" page that `/compare/<product>/` already gathers
  (`comparisonProductGroups`) is now left out of the index; the compare page
  stands in for all of them.
- **Guide entries are lean.** Title plus the first 200 characters of the
  description, snippet cut to 110 characters, the same trade the research
  entries make. The index grew from 1.55 MB to 2.35 MB raw, **453 KB to 679 KB
  gzipped**. The hub fetches it only on the first keystroke, never on a bare
  visit. If that cost matters later, splitting guides into a second file
  fetched after the first result would recover it.

A guide's result line reads "Guide · <tool name>", because many guide titles
lean on their tool ("This calculator vs. a flat rate per square foot").
Clicks record `guide_opened_from_search`, `post_opened_from_search` and
`page_opened_from_search` through the hub's existing local counter. The site
assistant (`assistant/client.js`) reads the same index by URL, so it can now
cite guides and posts too.

Checked in headless Chromium on the built hub at 390 px: the three query
kinds above render with the right label, clicking the first 1099-K result
lands on the guide, and the page logs no errors.

## Not done, and why

- **Long titles (2,623 over 65 characters; median 72).** These are written by
  hand per venture, and Google rewrites a long title rather than penalising
  it. A mechanical rewrite of 2,600 titles would trade keyword coverage for
  display length with no measurement behind it. Worth doing per flagship, with
  Search Console data, once there is any.
- **4 pages with two `<h1>`s** (`affiliate-disclosure-checker`,
  `page-seo-audit`, `shift-roster-builder`, `structured-data-drift-check`).
  Each is a venture's own markup, and a second H1 is not a ranking problem on
  its own.

## Verification

- `node --test "*.test.mjs"` in `platform/pages` (results in the run record's
  notes).
- `node platform/pages/check.mjs`: "looks publishable: 1313 products, 44
  category pages, 4238 pages, no dead links."
- Ranking table above: `searchScore`/`searchVariants` imported from
  `build.mjs` and run over the built `search-index.json`.
