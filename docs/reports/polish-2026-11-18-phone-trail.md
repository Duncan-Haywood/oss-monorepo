---
kind: polish
topics: [design, accessibility]
date: 2026-11-18
---
# Polish: a phone breadcrumb that only repeats the current tab is hidden

Date: 2026-11-18. Track: polish/0. PR #17295. Picked item 3 of "Still weakest" in
`polish-2026-11-18-homeowners-retirees-320.md` ("The 320 px header is 106 px tall ... Folding
the breadcrumb into the hero's eyebrow on phones would win about 30 px everywhere"). No polish PR
was open at the start; the draft was opened before the build to claim the item (item 3 of
`polish-2026-11-18-fold-check.md`).

## What changed

- `platform/pages/site-nav.mjs`, `renderSiteHeader`: the trail gets `pfs-dup` when every crumb
  but the last is unlinked or links to the current tab's own URL (`${toRoot}${tab.href}`). The
  phone block (`max-width:600px`) of `SITE_HEADER_CSS` sets `.pfs-crumbs.pfs-dup{display:none}`.
  Desktop and the HTML (crawlers, `share.mjs`'s `crumbsOf`) are unchanged.
- `site-nav.test.mjs`: one test covering audience, About, research topic (marked) and tool,
  project, no-current-tab and different-href (unmarked) trails.

Rather than fold the trail into the eyebrow (the earlier suggestion), it goes only where it is
pure repetition. A tool page's trail (category › tool) is its only way up, so it stays.

## Measured (Chromium, built site, scratch script over 40 pages × 3 viewports)

- 98 built pages carry `pfs-dup`: 31 audience pages, 31 research topics, the category index and
  20 category pages (`c/trades`, `c/cli`, ...), Custom development and its 5 request pages, the two
  story shelves (Hearth & Horizon, Saints by Candlelight: "Stories › <shelf>"), About, Ask,
  Feedback, Guides, Comparisons, Lab and Engineering.
- Header 106 → 79 px at 320, 360 and 390 on every one; h1 and first card move up 27 to 28 px.
- `fold-check.mjs`: passes at 390×844 (deepest 739 px) and at 360×780 (deepest 749 px; 30 of
  31 before by the same rule). At 320×640: 27 of 31 both before and after.
- No page gained sideways scroll.
- `node --test 'platform/pages/*.test.mjs'`: see the run record.

## Still weakest, and what I would do next

1. **The four short audience pages** (childcare 805, photographers 793, pool-hot-tub 753, etsy
   641 at 320×640) still miss the 320 fold. Moving the `starting` note and jump chips below
   the first cards in `renderCategoryPage` when there is no Start here row (carried over).
2. **The hero's top padding**: h1 starts 60 px below the header on audience pages at 320. With
   the trail gone the eyebrow could sit closer; 12 to 16 px less would show the first card's
   title at 320 on most pages.
3. **Tool pages are still 106 px** (their trail is useful). There, the trail could share the
   tab row's line on phones only if the tabs scroll; worth a mock-up, not a guess.
