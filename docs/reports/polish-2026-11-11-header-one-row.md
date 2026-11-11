---
kind: polish
topics: [design]
date: 2026-11-11
---
# Polish 2026-11-11: the site header stops giving Search a row of its own

**Why this item.** It was item 3 of "Still weakest" in `polish-2026-11-11-bare-tools.md`:
"At 1,100px the site header's Search pill wraps under the nav." Measuring it showed a bigger
problem. On every page except the hub, from 721px up, the Search control wrapped onto a row
of its own, alone at the left edge under the brand:

- **721–1,080px, every page family:** three rows (brand / links / Search).
- **≥1,081px, site pages** (/writing/, /research/, /compare/, /about/ …): two rows at any width,
  even 1,600px. The 236px search form could not share a row with ten links: brand 153 + links
  721 + gaps 44 + form 236 is 1,154px, and the bar is at most 1,120px.
- **Tool pages:** the same, plus a 1,000px column on the 98 base-stylesheet pages, so they never
  got one row.

This is likely a side effect of the nav growing to ten items ("Get it built", "Deploy your own").

**What changed** (`platform/pages/site-nav.mjs`, `SITE_HEADER_CSS`):
1. `[data-pfs-head] .pfs-bar{container:pfs-head/inline-size}` and
   `@container pfs-head (max-width:1017px)`: below one row's width, the links take their own row
   (`order:3; flex-basis:100%`) and the brand grows, so Search sits **top right on the brand row**.
   The query is on the bar's own content box, not the window. A tool page's header can sit in a
   1,000px column, with or without side padding. My first version put the container on the `nav`
   and broke 13 of 79 sampled tool pages that fit one row before. The venture chrome zeroes the
   bar's side padding, which the nav's width cannot see.
2. In that two-row layout the pill gets `margin-block:-4px`. It is 33px tall against the brand's
   line, so without this the two-row header was 9px taller than before.
3. The form is `flex:1 1 100px; max-width:236px; margin-left:auto`. It no longer forces a wrap at
   its full width; it fills what the row leaves (170px at 1,280px). Its placeholder is now
   "Search" (it was "Search tools & research", cut off at that width; the visually hidden label
   still says "Search all tools and research"). The pill also takes `margin-left:auto`, and
   `.pfs-nav` is `flex:0 1 auto`.
4. Test in `site-nav.test.mjs`: the container, the two-row rules and the form's flex are
   asserted. A rough width budget (7.9px a character for the link labels, measured) checks that
   a new nav item still fits under the breakpoint. If it fails, widen the breakpoint or shorten a
   label. 18/18 pass.

Browsers without container queries (Safari before 16) keep the old wrapping, nothing worse.
If a platform's fonts run wider than the 16px of slack, the row wraps as before.

**Measured.** Local full build before and after, headless Chromium, external requests blocked.
Sample: 79 pages (70 tool pages in a fixed shuffle, plus /writing/, /research/, /c/, /stories/,
/about/, /compare/, /updates/, /ask/, hub). Bar height in px:

| width | median before → after | max before → after | Search on brand row | sideways scroll |
|---|---|---|---|---|
| 320 | 94 → 86 | 122 → 114 | 53 → 53 | 2 → 2 (pre-existing) |
| 390 | 94 → 86 | 94 → 86 | 79 → 79 | 0 → 0 |
| 900 | 87 → 88 | 126 → 88 | 0 → 79 | 0 → 0 |
| 1280 | 96 → 88 | 126 → 88 | 24 → 78 | 0 → 0 |

No page in the sample got taller at any width. At 1,280px, /writing/ and /research/ go from 95
to 56px (one row); ai-bookkeeper stays at one row, 57px. On a phone the header is 8px shorter
(the pill's overhang).

Before / after, /writing/ at 1280 and 800 px, and a 1,000px-column tool page at 1280:

![blog 1280 before](img/polish-2026-11-11-header-blog-1280-before.png)
![blog 1280 after](img/polish-2026-11-11-header-blog-1280-after.png)
![blog 800 before](img/polish-2026-11-11-header-blog-800-before.png)
![blog 800 after](img/polish-2026-11-11-header-blog-800-after.png)
![tool 1280 before](img/polish-2026-11-11-header-tool-1280-before.png)
![tool 1280 after](img/polish-2026-11-11-header-tool-1280-after.png)

## Still weakest, and what I would do next

1. **1,000px-column tool pages never get one row.** Their bar is 968–1,000px, and one row needs
   1,016px. Two clean rows is fine, but a 1,040px bar or a shorter label ("Deploy your own" →
   "Deploy") would give them one. That is a navigation-wording call, so I left it.
2. **721–752px:** the links row itself wraps "About" onto a third line (links 721px wide, bar
   689px). This is a narrow band. The phone's sideways strip could extend to 760px.
3. **The 2 pages that scroll sideways at 320px** in the sample pre-date this change. Run
   `sideways` on them.
4. Carried over: row-setter sticky cards, wall-framing-takeoff TBT, `--min-a11y=100` nightly
   (control plane, own PR).

## How to rerun

The sweep is about 30 lines of Playwright: serve `platform/pages/dist`, and at each width read
`.pfs-bar`'s height, whether the visible `.pfs-search`/`.pfs-searchlink` top is within 20px of
`.pfs-brand`'s, and `scrollWidth > clientWidth`.
