---
kind: polish
topics: [design, phone, software-for-routine]
date: 2026-11-21
---
# Polish 2026-11-21: bid calculators reach the form sooner on a phone

Picked item 1 of "Still weakest" in `polish-2026-11-21-venture-fold-baseline.md`
(358 venture pages start their first field below 390×844), and within it the
largest single family: 25 `*-bid-calculator` pages. Trade bids are what the hub
leads with ("Built for Roofers"), so these are the pages a phone visitor from
the hub is most likely to open. Claimed in draft PR #18118; `polish_queue.py`
showed the item unclaimed and no open PR had `polish` in its title.

Looked first at the hub, Wall Framing Takeoff, the research index, Stories and a
post at 390 and 1280 px (full build of main): none scrolls sideways and all read
well; the bid family's fold was the weakest thing a visitor sees.

## What was wrong

Measured each of the 25 at 390×844 (header bottom, the two bars, first card,
first field). Two causes:

1. **The two bars above the form.** 118 pages carry the shop-rates bar
   (`pf-rates`) directly above the saved-bids bar (`pf-jobs`). Each kept its own
   12 px bottom margin and 8 px top padding, so two one-line rows that belong
   together had 20 px of air between them and took 97 px with their margins.
2. **Long heroes.** On ten pages the header ended at 611 to 786 px: a 64 to 93
   word lede, or a second "You get ..." paragraph, or three or four
   comparison links each on its own paragraph.

The other eleven sit low for reasons inside the first card (preset buttons before
the fields on cabinet-refinishing, row headers and a long hint on hardwood and
paver-patio). Not touched; see "Still weakest".

## What changed

1. `platform/pages/jobs.mjs` (`pf-jobs.css`): `.pf-rates:has(+.pf-jobs){margin-bottom:0}`
   and `.pf-rates+.pf-jobs{padding-top:4px}`. The pair now reads as one block
   with a 4 px step; the first field moves up 16 px on all 118 pages. The bars'
   own markup, scripts and print rules are unchanged. pf-jobs.css is linked
   wherever `.pf-jobs` is, so it carries the rule for the bar above it.
2. **Nine hero folds** in the established pattern (`details.hero-more` after a
   `p.lede` of at most 50 words, `hero-fold.test.mjs`), each keeping its first
   sentence or paragraph visible and folding the rest unchanged:
   janitorial and boiler-replacement ("What you get"), biohazard-cleanup,
   locksmith, home-staging, ice-dam-removal, vehicle-wrap ("What it prices"),
   water-heater ("What you get"), forestry-mulching ("The 3-acre example"; its
   "Everything runs in this browser; nothing is uploaded." paragraph stays
   visible). The fold style is the one the earlier runs used, with
   `currentColor` for the summary and focus ring so it inherits each page's
   palette.
3. **Comparison links on one line.** forestry-mulching (3), water-heater (3),
   security-camera (4): the stacked `p.seo-link` paragraphs became one line
   joined by `&middot;`, the way flooring and window-replacement already show
   theirs. Every link and target is kept; anchor text loses only trailing clauses
   ("&mdash; the worked example, line by line", "for when each is the right one
   to reach for"). locksmith's link
   paragraph moved from `p.lede` size to the page's own `p.note`; home-staging's
   HoneyBook link moved out of the lede into a `p.note` after the fold.
4. `venture-fold-baseline.json`: the 11 pages now on the first screen removed;
   the four improved but still below (biohazard 853, forestry 873, janitorial
   876, water-heater 877) recorded at their new depth so the ratchet holds the
   gain.

Nothing new is claimed on any page; no text was rewritten beyond the anchor
trims in item 3.

## Measured (Chromium, 390×844; `venture-fold.mjs --check` over the full build)

| Page | header bottom | first field top |
|---|---:|---:|
| janitorial | 642 → 474 | 1060 → 876 |
| boiler-replacement | 611 → 423 | 920 → 716 |
| forestry-mulching | 774 → 592 | 1055 → 873 |
| biohazard-cleanup | 786 → 643 | 1012 → 853 |
| locksmith | 763 → 585 | 994 → 796 |
| water-heater | 701 → 604 | 990 → 877 |
| home-staging | 664 → 572 | 921 → 808 |
| ice-dam-removal | 634 → 550 | 866 → 759 |
| vehicle-wrap | 634 → 523 | 866 → 732 |
| security-camera | 611 → 559 | 860 → 792 |
| flooring, window-replacement, irrigation-winterization, flat-roof, spray-foam (bars only) | — | 830–842 → 814–826 |

Site-wide: venture pages with the first field below 390×844 **358 → 347**
(1,384 measured with a field). Bid-calculator family: 25 → 14. `--check` passes
(no page deeper than its baseline). Screenshots (390×844, 2x):
`img/polish-bid-hero-{before,after}-locksmith-390.png`.

Tests: the ten ventures' own suites (126 to 247 tests each) pass;
`jobs*.test.mjs`, `hero-fold.test.mjs`, `venture-fold.test.mjs` (251) pass;
`node --test 'platform/pages/*.test.mjs'` result in the run record's notes.

## Still weakest, and what I would do next

1. **14 bid calculators still below the fold**, and most of these causes are inside
   the first card: cabinet-refinishing 1102 (preset buttons before the first
   field: arguably fine, the presets are the first action), hardwood-refinishing
   1027 and paver-patio 943 (card hint plus column header row), attic-insulation
   883, carpet-cleaning 870, wildlife-exclusion 849, hood-cleaning 852, lawn-care
   851, automatic-driveway-gate 859, liquidation-pallet 834 (no rates bar; a
   78 px saved-bids bar with the share button). `venture-fold.mjs` counts the
   first input, not the first control; counting a preset button as the first
   control would be fairer to cabinet-refinishing and similar pages. Decide that
   before trimming card hints.
2. **The header's 26 px bottom margin** plus the bars' 8 px top padding sits
   between every bid hero and its first bar. A shared `header + .pf-rates`
   rule could take 8 to 10 px more on all 118, but the margin is each venture's
   own; measure a sample of palettes before changing it.
3. **Next family:** `*-to-journal` (18 in the baseline, median 934) and the
   `*-fee-calculator` / `*-report-analyzer` pages (10 and 9).
4. Carried over from `polish-2026-11-21-venture-fold-baseline.md`: `--check`
   in CI (control plane, own PR), eight csv-check pages at 360 px.
