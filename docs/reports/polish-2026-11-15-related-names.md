---
kind: polish
topics: [design, seo]
date: 2026-11-15
---
# Polish 2026-11-15: related-tool links and index cards say the tool's name

Track: polish/0. Picked from `polish-2026-11-15-tool-crumb-name.md`, "Still weakest" item 2
(related-tool links and the embed widget still use the full search title). Searched open PRs for
`polish` and `related` in titles: three old polish PRs (#11730, #14012, #12397), none on this.

## What was wrong

`addSiteChrome` already read each tool's short name (`toolName`: the JSON-LD
`*Application` name, else the `<title>` cut at its dash) for the breadcrumb, but only for the
tool being wrapped. The four "More free tools" links in the footer of every tool page used the
*other* tools' `surface.title`, the search-result title. So a footer read "ActiveCampaign Import
CSV Check — free, private, in your browser", wrapped to two lines on a phone. The embed offer
used the same title, and its iframe title appends "— free calculator, …", so it said "free"
twice. The Comparisons index, the 45 per-product comparison pages and the Guides index printed
the same full titles as card headings.

## What changed (`platform/pages/build.mjs`)

- `addSiteChrome` reads every tool's `toolName` once, before the per-tool pass, into a map.
  The trail, the related links and the embed offer all take the name from it.
- `renderComparePage`, the comparison product pages and `renderGuidesPage` run the tool title
  through `cardName`, the function the hub's cards already use.
- New test in `build.test.mjs`: every footer related link and every embed title equals the
  target tool's `toolName`.

## Measured (full production build, before and after, 1,365 tool entry pages)

| | before | after |
|---|---|---|
| footer related links | 5,460 | 5,460 |
| median label length | 55 chars | 29 |
| 90th percentile | 77 | 39 |
| longest | 112 | 60 |
| labels with a tagline (" — ", "free, private", "in your browser") | 2,296 | 0 |
| embed titles containing "free" | 691 | 22 (names like "Freelancer Tax Pack") |
| Guides index tool headings with a dash tagline | 140 of 622 | 0 |
| Comparison card headings (index + 45 product pages) with a dash tagline | 46 of 446 | 0 |
| Comparisons "one product" list labels with a dash tagline | 77 of 520 | 0 |

The last three rows' "after" is `cardName` applied to the before build's 1,588 labels
(not a second full build); the footer rows are from a full rebuild.

Screenshots of the einvoice-preflight footer list at 390 px:
`docs/reports/img/polish-2026-11-15-related-before.png` (164 px tall, two labels wrap) and
`docs/reports/img/polish-2026-11-15-related-after.png` (117 px, one line each).

## Still weakest, and what I would do next

1. **`cardName` and `toolName` can disagree.** The hub and index pages use `cardName(title)`;
   the trail and footer use the JSON-LD name first. Passing the `names` map (or a `name` field
   on each surface, set once at load) to every renderer would make one name site-wide.
2. Carried over: the phone crumb clips long category + name pairs; the podcast chip row has no
   edge fade; a sweep check for crushed controls in nowrap rows; Tools and projects is still
   about half the blog.
