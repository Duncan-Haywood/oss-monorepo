---
kind: polish
topics: [design]
date: 2026-11-15
---
# Polish 2026-11-15: on a phone, the category crumb gives way to the tool's name

Track: polish/0. Picked from `polish-2026-11-15-tool-crumb-name.md`, "Still weakest" item 1 (the
phone crumb clips on long category + name pairs). Item 2 there (related links) is PR #16194, open
when this run started, so not taken. The breadcrumb is the first line under the header on all
1,365 tool pages and every research project page, and one shared component draws it.

## What was wrong

Under 600 px the trail is one line (`site-nav.mjs`, `SITE_HEADER_CSS`): "Home", the separators and
the middle crumbs kept their full width (`flex:0 0 auto`) and the page's own name got whatever was
left (`flex:1 1 0`). Categories are long ("Compliance checks & evidence records", 36 characters),
so at 390 px the name usually lost: "Home › CI checks & developer gates › Actions Ch…". At 360 px,
62 trails did not fit even without the name and ran off the right edge.

## What changed (`platform/pages/site-nav.mjs`)

- A linked middle crumb whose label is over `MID_CRUMB_CHARS` (12) characters gets
  `class="pfs-mid"`. Under 600 px it shrinks first (`flex:0 100000 auto`), down to `min-width:4.5em`
  (about five characters and an ellipsis), and only then is the page's name cut
  (`flex:0 1 auto;min-width:0`). Short crumbs ("Tools", "Research") are not marked: a 4.5em floor
  stretched "Tools" and left a gap before the separator (seen on `compare/accessibe` in the first
  attempt).
- The shrink ratio is large on purpose. Flex shares a shortfall by shrink × width, so at 1000 to 1
  the name still lost a fraction of a pixel, enough for Chrome to draw an ellipsis on a name that
  fitted ("Actions Checkout Credentials Che…").
- With a middle link in the trail, "Home ›" is hidden on a phone (`:has()`); the brand beside the
  trail already links home. Without `:has()` support the old trail shows.
- `researchChromeTemplate()`: the topic crumb is passed `mid: true`, because the template's label
  is the placeholder `{{TOPIC}}` (9 characters) while real topic names are long.
- Tests (`site-nav.test.mjs`): marking at and over the limit, the phone rules, and the research
  template's topic crumb carrying the class.

Desktop is unchanged: the rules are inside `@media (max-width:600px)`.

## Measured

Production build, Playwright, every tool entry page (1,365), JavaScript on, `.pfs-crumbs`. "Shown
in full" means the name's `scrollWidth` is not more than its `clientWidth`.

| | 390 px before | 390 px after | 360 px before | 360 px after |
|---|---|---|---|---|
| tool name shown in full | 93 | 1,305 | 33 | 1,184 |
| tool name cut | 1,272 | 60 | 1,332 | 181 |
| trail runs past the edge | 0 | 0 | 62 | 0 |
| median characters of the name visible | 13 | 29 | | 29 |
| 10th percentile | 8 | 19 | | 19 |
| median characters of the category visible | 28 | 22 | | 17 |
| row height | 28 px | 28 px | 28 px | 28 px |

`node platform/pages/check.mjs`: "looks publishable: 1365 products, 45 category pages, 10037
pages, no dead links." Screenshot: `docs/reports/img/polish-crumb-gives-way-390.png` (two tools
before and after at 390 px).

Research project pages (1,080 with a topic crumb, same method, 390 px, pf-site.css before and
after): the trail ran past the screen edge on 183, now 0; median characters of the project title
visible 7 (10th percentile 0) before, 33 (10th percentile 31) after. Titles are questions, so most
are still cut (1,078), but a reader now sees the start of the question instead of "Wh…" or nothing.

The 60 names still cut at 390 px are long declared names ("ADA Title II Website Accessibility
Evidence Report", "BAI2 to OFX, QBO, QIF and Xero CSV Converter"); they now show about 30
characters instead of about 10.

## Still weakest, and what I would do next

1. **61 tool pages have no left gutter at 390 px**: the brand, the nav and the trail start at
   x = 0 (`1099-vendor-tracker`, `1099-k-threshold-checker`, `agent-workroom`,
   `appointment-deposit-calculator`, `card-processing-fee-audit`, ...; `.pfs-brand` left edge under
   8 px). Something in those tools' own CSS beats the chrome's padding. A shared fix in
   `VENTURE_CHROME_CSS` plus a check in `platform/pages/` would close it.
2. Carried over: the podcast row has no edge fade; a sweep check for crushed controls in nowrap
   rows; Tools and projects is still about half the blog.
3. Research project titles are still cut on a phone (they are sentences, 33 characters show).
   Hiding the topic crumb there too, or letting the title wrap to a second line on project pages,
   is the next step; it needs a look at how much height a second line costs above the fold.
