---
kind: polish
topics: [design, depth]
date: 2026-11-19
---
# Polish: flagship heroes in one order

Date: 2026-11-19. Track: polish/0. PR #17779 (draft opened before measuring, to claim the item).
Picked item 1 of "Still weakest" in `polish-2026-11-19-cta-row-phone.md` ("The flagship heroes
are still five different designs"). `polish_queue.py` listed it open; no open PR had `polish` in
its title.

## What was wrong (main, full build, served with site chrome)

Eight flagships in `portfolio/flagships.yaml` open with a `<header>` hero (photo-editing and
quick-pick-survey have no index page; chant-forge, ids-model-check and xer-schedule-check are app
shells without one). Their parts came in four orders:

| page | order before |
|---|---|
| wall-framing-takeoff | h1 (the product name) > buttons > lede > note |
| ai-bookkeeper, changepoint-detector, open-tennis-robots | eyebrow > h1 > buttons > lede > note |
| sales-agent, shift-roster-builder, league-schedule-generator | eyebrow > h1 > **lede** > buttons > note |
| einvoice-preflight | eyebrow (styled) > h1 > buttons > lede > details |

The "eyebrow" was plain muted `.note` text on six pages and a bold, letter-spaced label only on
einvoice-preflight. The report I took the item from described the split as wall-framing and
changepoint putting the buttons above the lede; reading the HTML, four pages already did, and the
three outliers were the ones putting them *below* a seven-to-nine-line lede.

## What changed

- **One order on all eight:** eyebrow, headline, the two buttons, then the lede and detail. The
  three outliers had their `p.cta-row` moved up (no copy changed).
- **One eyebrow style:** each `p.note` eyebrow gains the `eyebrow` class and one
  `<style>/* flagship-hero */` rule: `.78rem`, weight 700, `letter-spacing .08em`, in the page's own
  headline colour (so each product keeps its palette). einvoice-preflight already matched and was
  left alone.
- **wall-framing-takeoff** gained an eyebrow ("For framers and builders · runs in your browser ·
  nothing uploaded", each claim already in its lede) and a headline that says what it does: "Wall
  framing takeoff: every stud, a cut list and the cheapest boards". The `<title>` is unchanged.
  The h1 keeps the query words "wall framing takeoff".

## Measured (Playwright, full build of main vs `--only` preview of the eight pages)

Top of the first button, in px from the top of the page:

| page | 390 before | 390 after | 1280 before | 1280 after |
|---|---|---|---|---|
| wall-framing-takeoff | 173 | 278 | 160 | 232 |
| ai-bookkeeper | 295 | 284 | 198 | 190 |
| sales-agent | 511 | 284 | 340 | 240 |
| changepoint-detector | 264 | 272 | 200 | 191 |
| einvoice-preflight | 231 | 231 | 233 | 233 |
| shift-roster-builder | 561 | 284 | 365 | 240 |
| league-schedule-generator | 486 | 284 | 316 | 240 |
| open-tennis-robots | 328 | 317 | 246 | 238 |

At 390 the spread went from 173–561 px to 231–317 px; five of eight pages now put the buttons at
the same 284 px. The cost: wall-framing-takeoff's hero is 105 px taller on a phone (first card
696 → 802) because it now has an eyebrow and a two-idea headline instead of a three-word one.
Header heights elsewhere moved by ≤ 11 px.

Screenshots: `img/polish-hero-order-{before,after}-sales-agent-390.png` and
`img/polish-hero-order-{before,after}-wall-framing-takeoff-390.png`.

## The check

`platform/pages/flagship-hero-order.test.mjs` (static, ~0.1 s): for each flagship whose
`index.html` opens `<body>` with a `<header>`, the header's first-level children must start
`p.eyebrow`, `h1`, then `p.cta-row` when there is one. On main it lists 7 of the 8 pages; with this
PR it passes. Venture `page.test.mjs` suites for the seven edited ventures pass (134, 26, 10, 21,
24, 59, 10).

## Still weakest, and what I would do next

1. **The ledes are long.** ai-bookkeeper's is 10 phone lines, sales-agent's and shift-roster's 8.
   With the buttons above them that no longer hides the buttons, but a one- or two-sentence lede
   with the detail moved into the first card's intro would bring each first card up 150 to 250 px.
   That is copy on pages with SEO weight: do one, measure, then the rest.
2. **wall-framing-takeoff's "Save bids, mark them won or lost." row** (carried over, item 2 of the
   cta-row report) is injected by `platform/pages/jobs.mjs` (`JOBS_FIRST_VISIT_STATUS`) on every
   tool with saved jobs, not just this one. Moving it inside the first card or after the result is a
   platform change: look at all its hosts at once.
3. **The jump-chip `nav.pf-jump`** sits in the hero on three flagships (ai-bookkeeper,
   shift-roster, league) and nowhere on the other five. Either the other five get guides links there
   or the three move theirs below the first card.
4. **Extend the check beyond flagships** once item 1 settles: `grep -l 'class="cta-row"' ventures/*/index.html`
   finds two more pages (ids-model-check, xer-schedule-check) whose button rows aren't in a header.
