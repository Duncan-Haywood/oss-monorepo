---
title: "The form is the point: getting bid calculators' first field onto a phone screen"
seo_title: "Contractor bid calculators on a phone: first field above the fold"
date: 2026-11-21
tags: [site-design, polish, phone, testing]
description: "25 trade bid calculators started their first input below a 390×844 phone screen. A 16 px spacing fix and nine shorter intros brought 11 of them up."
---

A contractor who opens a bid calculator on a phone wants to type a number.
On 25 of the trade bid calculators here, the first box to type into started
below the bottom of a 390×844 screen (an ordinary recent phone), between
834 and 1,102 pixels down. The page had to be scrolled before it did anything.

We measure this with a script, `platform/pages/venture-fold.mjs`, which opens
every tool page in Chromium at phone size and records where the first card
and the first input start. A baseline file lists the pages that miss the first
screen. A later page can't fall further down without the check failing. This
morning that list held 358 tool pages, and the bid calculators were its
largest single family.

## Two causes

**Two small bars, with space meant for one.** Above the form, 118 bid
calculators show two one-line bars: "Save rates once for every bid" and "Save
bids, mark them won or lost". Each bar was styled on its own, with its own
margin below and padding above. Stacked, they left 20 px of air between two
rows that belong together. The two bars and their margins took 97 px. One CSS
rule in the shared stylesheet now treats them as a pair with a 4 px step
between rows. That moves the form up 16 px on all 118 pages and put five of
them (flooring, window replacement, irrigation winterization, flat roof,
spray foam) on the first screen.

**Intros written for a desktop.** On ten pages the header alone ended 611 to
786 px down. The cause was a 64 to 93 word opening paragraph, a second "You
get..." paragraph, or three or four comparison links stacked one per line.
Each now shows its first sentence or paragraph, and the rest sits behind a
"What it prices" or "What you get" toggle. The words are unchanged and still
in the page for search engines. The stacked comparison links became one line
separated by dots, the way the flooring page already showed them. The
locksmith page's header went from 763 px to 585 px, and its first field from
994 px to 796 px.

## The numbers

| | before | after |
|---|---:|---:|
| Tool pages with the first field below 390×844 | 358 | 347 |
| Bid calculators below it | 25 | 14 |
| Janitorial bid calculator, first field | 1,060 px | 876 px |
| Boiler replacement, first field | 920 px | 716 px |

The other 14 sit low for reasons inside the form itself: preset buttons
before the first box, or a long hint above a row of column headings. Some of
those are arguably right. A row of "start from a common job" buttons is a
fine first thing to tap, so the next question is whether the measurement
should count a button as the first control. That is written down for the
next run, along with the baseline, which now records the improved pages at
their new depth so they can't quietly slide back.

Nothing here is a claim about traffic or rankings. Usage is unmeasured.
What we can say is that on these pages a phone visitor now sees where to type
without scrolling.
