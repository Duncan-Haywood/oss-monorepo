---
kind: polish
topics: [design]
date: 2026-11-17
---
# Polish: tool-page h1s capped at 3rem, 245 pages, and a check that keeps them there

Date: 2026-11-17. Track: polish/0. Picked item 3 of "Still weakest" in
`polish-2026-11-16-hero-walls.md` ("The ADA page's h1 is 5rem across four lines at 1,280").
Open PRs searched (`polish in:title`): #11730, #14012, #12397; none touch tool-page headings.

## What was wrong

The ADA page was not alone. A new browser scan, `platform/pages/hero-heading.mjs`, opened all
1,364 built tool pages at 1,280x900 and 390x844 and measured the h1. The median h1 is 97 px
tall at 1,280 with a 44.8 px (2.8rem) font. But 247 pages' own CSS let the h1 grow to 3.1 to
6rem, and 40 of them rendered taller than 160 px at 1,280 (card-processing-fee-audit 282 px,
cam-reconciliation-check 274, consent-change-record 265, ada-title-ii-evidence 228). On a
900 px laptop screen that is a third of the first view spent on the heading, before the lede and
the tool. Two more pages had a 132 and 158-character question as the h1, 7 and 8 lines (218 and
249 px) on a phone.

## What changed

- **Every `h1` clamp ceiling above 3rem is now 3rem** (245 ventures, 247 files: index.html or
  style.css). Only the ceiling moved: the floor and the vw term are untouched, so phones
  (where the floor or vw governs) are unchanged on all but three pages, and the page's own type
  face, weight, line height and letter spacing stay its own.
- **cam-reconciliation-check** also had `max-width:12ch` on its h1, which made four lines of a
  51-character heading; it is 20ch now.
- **mobile-oil-change-route-profit-calculator** and **mobile-phlebotomy-route-profit-calculator**:
  the h1 drops its second question ("and is solo, a franchise or a job the better way to run the
  van?"). The lede right under it already says the tool compares solo against a franchise or
  agency and a job, so nothing a reader or a search engine needs is lost. `llms.txt` line 1
  matches the new h1.
- **`hero-heading.test.mjs`** (in the pages suite, no browser): fails when any
  `ventures/*/index.html` or its `style.css` sizes an h1 above `MAX_H1_REM` (3rem), by clamp
  ceiling or fixed rem size. No exceptions list: none are over after this change.
- **`hero-heading.mjs`** (needs a build and Chromium, not in CI): the rendered measurement,
  exit 1 when an h1 passes 160 px at 1,280 or 200 px at 390.

## Measured (local full build, Playwright, every tool page, before and after)

| | before | after |
|---|---|---|
| h1s over 160 px at 1,280 | 40 | 0 |
| h1s over 200 px at 390 | 2 | 0 |
| tallest h1 at 1,280 (any page) | 282 px | 153 px |
| tallest h1 at 390 | 249 px | 193 px |
| 245 changed pages, mean h1 at 1,280 | 127 px | 90 px |
| 245 changed pages, total h1 height at 1,280 | 31,172 px | 21,997 px |
| median h1 at 1,280, all 1,364 pages | 97 px | 95 px |
| median h1 at 390 | 93 px | 93 px |

No page's h1 got taller at either width. The 40 worst, at 1,280: card-processing-fee-audit
282 → 144, cam-reconciliation-check 274 → 137, consent-change-record 265 → 88,
appointment-deposit-calculator 251 → 91, patent-maintenance-fee-planner 230 → 144,
ada-title-ii-evidence and shopify-a11y-evidence 228 → 91, freelance-retainer-calculator
226 → 94; at 390, mobile-oil-change 249 → 155 and mobile-phlebotomy 218 → 124.

The "before" screenshots re-apply the old h1 rule to the new build; the rendered heights match
the before scan (282 and 228 px), so they show the old page faithfully:
`img/polish-2026-11-17-hero-headings-{card-processing-fee-audit,ada-title-ii-evidence}-{before,after}-1280.png`.
On card-processing-fee-audit the first input moves into the first 900 px view.

## Still weakest, and what I would do next

1. **Long question h1s on a phone.** Now the tallest at 390: bookkeeping-client-fee-calculator
   (105 characters, 6 lines, 193 px), hydroponic-farm-profit-calculator (125), pet-boarding and
   kombucha-brewery profit calculators (118). The same shortening as the two mobile-route pages
   (keep the first question, let the lede carry the rest) would take each to about 4 lines.
   `node platform/pages/hero-heading.mjs` lists them; lowering the 390 budget to 160 px is the
   follow-up check.
2. **Pages whose h1 is styled by a shared venture stylesheet** outside `index.html`/`style.css`
   (e.g. a `../shared/*.css`) are not read by the static test. None rendered over budget today,
   but the browser scan is the only guard for them.
3. Carried over from `polish-2026-11-16-hero-walls.md`: item 1 (72 ledes at 91 to 120 words) and
   item 2 (the ADA related list's line height).
