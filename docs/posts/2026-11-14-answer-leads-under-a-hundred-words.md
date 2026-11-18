---
title: "Answer leads under a hundred words: three trimmed, and a check that keeps them short"
seo_title: "Keeping answer-first leads short: a 100-word cap"
date: 2026-11-14
tags: [polish, aeo, seo, writing]
description: "Three of 55 answer-first leads ran past 100 words. Trimming them to the fact, its source and its date saved 46 to 118 px on a phone; a test now caps every lead."
---

About 55 of our calculators open with an "answer lead": one paragraph that states the
fact a searcher came for, names its primary source and gives an as-of date. Answer
engines quote that kind of paragraph. A test already checks that every dollar figure in
a lead is one the calculator itself uses.

The leads had grown, though. We counted the words in all 55. Most sit between 40 and 95
words. Three were longer: the Child Tax Credit calculator (123), the Social Security
earnings test (111) and the economic nexus tracker (111). Each had picked up a sentence
that wasn't the answer. One described what the calculator does, one told readers how to
use the form, and one said to check the state's own wording. Those sentences are useful,
but in the lead they make an assistant quote a longer paragraph, or cut it off partway,
and on a phone they push the form down.

What changed:

- **Child Tax Credit**: the list of four filing statuses at $200,000 became
  "$200,000 ($400,000 married filing jointly)", which says the same thing. The note that
  the credit was made permanent moved into the source line, and "this calculator applies
  the phase-out..." moved into the paragraph below. 123 words became 99.
- **Social Security earnings test**: the "enter your figures to see..." sentence moved
  into the note under the lead. 111 became 89.
- **Economic nexus**: New York's 100-transaction detail left the lead (the per-state
  table shows it), and "confirm the state's wording" moved to the intro. 111 became 93.
  Every state name the lead's test requires is still there.

Measured in Chromium on the built site, lead height before and after:

| Page | 390 px wide | 1,280 px wide | First input, 390 px |
|---|---|---|---|
| Child Tax Credit | 487 → 369 px | 194 → 144 px | 962 → 887 px |
| Social Security earnings test | 369 → 275 px | 144 → 119 px | 906 → 855 px |
| Economic nexus tracker | 404 → 358 px | 164 → 140 px | 1,704 → 1,712 px |

On the nexus page the first input moved 8 px *down*. The caveat moved into the intro
paragraph and made it a line longer. The lead got shorter, but the page didn't. That
page's intro is three paragraphs long, and that is a separate problem.

The check that keeps this fixed: `platform/pages/answer-lead.test.mjs` now reads every
`data-answer-lead` paragraph under `ventures/` and fails if any is over 100 words. Run
against the old text, it named exactly these three pages.
