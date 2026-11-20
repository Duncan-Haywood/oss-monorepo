---
kind: polish
topics: [design, accessibility]
date: 2026-11-20
---
# Polish: venture eyebrows cut to two items, with a test over every venture

Date: 2026-11-20. Track: polish/0.
Picked item 3 of "Still weakest" in `polish-2026-11-19-short-ledes.md` ("Eyebrows wrap to two
lines on a phone"). `polish_queue.py --days 2` listed it open; no open PR had `polish` in its
title.

## What was wrong

The small-capitals line above each hero headline (`p.eyebrow`) ran three or four items on ten
venture pages, for example `AI BOOKKEEPER · DOUBLE-ENTRY · RUNS IN YOUR BROWSER · NOTHING
UPLOADED`. On a phone it wrapped to two or three lines and said again what the lede says a few
lines later. Seven of the ten are flagships.

## What changed

Each of the ten keeps two items: the product (or its audience) and the one privacy or licence
fact. Nothing new is claimed; every kept item was already on the page.

| Page | Before | After |
|---|---|---|
| ai-bookkeeper | AI BOOKKEEPER · DOUBLE-ENTRY · RUNS IN YOUR BROWSER · NOTHING UPLOADED | AI BOOKKEEPER · NOTHING UPLOADED |
| cash-application-matcher | ACCOUNTS RECEIVABLE · CASH APPLICATION · RUNS IN YOUR BROWSER | CASH APPLICATION · RUNS IN YOUR BROWSER |
| changepoint-detector | CHANGEPOINT DETECTOR · RESEARCH ALGORITHMS IN YOUR BROWSER · NOTHING UPLOADED | CHANGEPOINT DETECTOR · NOTHING UPLOADED |
| interview-content-studio | Interview Content Studio · free · runs in your browser | Interview Content Studio · runs in your browser |
| league-schedule-generator | LEAGUE SCHEDULE GENERATOR · RUNS IN YOUR BROWSER · NOTHING UPLOADED | LEAGUE SCHEDULE GENERATOR · FREE |
| open-tennis-robots | OPEN TENNIS ROBOTS · OPEN-SOURCE HARDWARE + SOFTWARE · MIT LICENCE | OPEN TENNIS ROBOTS · MIT LICENCE |
| sales-agent | SALES AGENT · INBOX AGENT · RUNS IN YOUR BROWSER · SENDS NOTHING | SALES AGENT · SENDS NOTHING |
| shift-roster-builder | SHIFT ROSTER BUILDER · RUNS IN YOUR BROWSER · NOTHING UPLOADED | SHIFT ROSTER BUILDER · NOTHING UPLOADED |
| texas-electricity-plan-checker | TEXAS ELECTRICITY · FREE · NOTHING UPLOADED | TEXAS ELECTRICITY · NOTHING UPLOADED |
| wall-framing-takeoff | FOR FRAMERS AND BUILDERS · RUNS IN YOUR BROWSER · NOTHING UPLOADED | FOR FRAMERS · NOTHING UPLOADED |

League and wall framing took a shorter second pass: two items of 44 characters still wrapped at
390 px (the eyebrow is 12.5 px capitals with 0.08em tracking in a 358 px box, so about 40
characters fit). "Free" is in the league page's title and description already.

## Measured

Built site (`node platform/pages/build.mjs`), Playwright at 390×844 and 320×844, eyebrow lines =
box height / line height; "card" = top of the first `main` section in px.

| Flagship | 390 lines before → after | 390 card before → after | 320 lines before → after |
|---|---|---|---|
| wall-framing-takeoff | 2 → 1 | 744 → 725 | 2 → 1 |
| ai-bookkeeper | 2 → 1 | 738 → 719 | 3 → 1 |
| sales-agent | 2 → 1 | 653 → 634 | 2 → 1 |
| changepoint-detector | 3 → 1 | 605 → 568 | 3 → 2 |
| einvoice-preflight (unchanged) | 1 → 1 | 595 → 595 | 2 → 2 |
| shift-roster-builder | 2 → 1 | 720 → 701 | 2 → 2 |
| league-schedule-generator | 2 → 1 | 692 → 673 | 3 → 1 |
| open-tennis-robots | 2 → 1 | 758 → 739 | 2 → 1 |

Every flagship eyebrow is one line at 390 px; the first card moves up 19 to 37 px.
Screenshots: `img/polish-two-item-eyebrows-{before,after}-{ai-bookkeeper,league-schedule-generator}-390.png`.

## The check

`platform/pages/flagship-hero-order.test.mjs` gains `eyebrowItems()` and a test over every
`ventures/*/index.html`: a `p.eyebrow` names at most two items (split on `·` or `&middot;`). On
main it fails for the ten pages above; with this PR it passes (189 eyebrows checked).

## Still weakest, and what I would do next

1. **Long single-item eyebrows.** 44 of 189 venture eyebrows are over 40 characters
   (`FOR MANUFACTURING, INDUSTRIAL AND LEAN ENGINEERS, PLANT MANAGERS AND STUDENTS`). They are one
   item, so the new test passes them, but most wrap on a phone. Their font sizes differ per page,
   so measure in the browser (this run's script: eyebrow height / line height over `dist/<slug>/`)
   before setting a character cap.
2. **At 320 px** changepoint-detector, einvoice-preflight and shift-roster-builder still wrap to
   two lines. Fine at that width, but a 36-character target would get them to one.
3. **ai-bookkeeper's jump chips** still take three rows at 390 (114 px), because the first chip
   reads "How to do it from bank statements". A shorter label that keeps the query words
   ("Bookkeeping from statements") would likely fit two rows; check the guide's title first.
4. Carried over: `polish-2026-11-19-short-ledes.md` items 1, 2 and 4.
