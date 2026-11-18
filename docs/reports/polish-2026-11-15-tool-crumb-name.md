---
kind: polish
topics: [design, seo]
date: 2026-11-15
---
# Polish 2026-11-15: a tool's breadcrumb is its name, not its search title

Track: polish/0. Picked from `polish-2026-11-15-podcast-chips.md`, "Still weakest" item 4 (Wall
Framing Takeoff's breadcrumb ends in the full title). The top flagship's first line under the
header, and a shared component, so one fix covers every tool. Searched open PRs: no polish or
breadcrumb PR open.

## What was wrong

`addSiteChrome` passed `surface.title` (from `readMeta`: `og:title`, else `<title>` before `|`)
to `injectChrome` as the tool's crumb label and as the `BreadcrumbList` item name. Titles are
written for search results, so the trail ended in "— free, private, in your browser", "— free,
2026", or a question ("Is your red GitHub Actions check even real?").

## What changed

- `toolName(html, title)` in `platform/pages/build.mjs`: the `name` of the first JSON-LD node
  typed `*Application` (SoftwareApplication, WebApplication, ...) on the tool's entry page,
  including inside `@graph`; names over 60 characters are skipped. Fallback `cardName(title)`
  (`home.mjs`, the hub cards' rule). Then names over 40 characters are cut at the first `: `
  (and a trailing "in your browser" dropped).
- `addSiteChrome` reads `dist/<slug>/index.html` once per tool, before its pages are chromed,
  and passes `toolName(...)` as `title`. Story shelves still use `STORY_VENTURES` first.
- Tests (`build.test.mjs`): a unit test for `toolName` and the trail it produces; the site test
  "each tool entry page carries breadcrumb structured data" now expects `toolName(html, title)`.
- Not changed: `surface.title` for hub cards, related links and the embed widget.

## Measured

Across the 1,350 `ventures/*/index.html` (script: `readMeta` vs `toolName`):

| last crumb | before | after |
|---|---|---|
| tools whose crumb changes | | 1,068 |
| median length | 55 | 29 |
| p90 length | 77 | 39 |
| max length | 112 | 56 |
| ends in / contains `?` | 312 | 0 |
| contains "free" | 682 | 3 (part of the name) |

Production build, Playwright, `.pfs-crumbs`:

| page | width | before | after |
|---|---|---|---|
| wall-framing-takeoff | 390 | "Wall Framing Takeof…" (clipped) | "Wall Framing Takeoff" (not clipped) |
| actions-runner-starvation-check | 390 | "Is your red GitHub…" (clipped) | "Actions Runner Sta…" (clipped) |
| actions-runner-starvation-check | 1,280 | "Is your red GitHub Actions check even real?" | "Actions Runner Starvation Check" |

Row height unchanged (28 px). Screenshots: `docs/reports/img/polish-tool-crumb-{before,after}-*.png`.

## Still weakest, and what I would do next

1. **The phone crumb still clips on long category + name pairs** ("CI checks & developer gates"
   leaves ~18 characters). Dropping the category crumb under ~480 px, or showing only
   "‹ category" there, would let the name fit; check how other sites handle a three-level trail.
2. **Related-tool links and the embed widget still use the full search title**
   (`injectChrome` "related" list, `injectEmbedWidget`). The related links would read better with
   `toolName` too; needs `relatedTools` to carry it.
3. Carried over: the podcast row has no edge fade; a sweep check for crushed controls in nowrap
   rows; Tools and projects is still about half the blog.
