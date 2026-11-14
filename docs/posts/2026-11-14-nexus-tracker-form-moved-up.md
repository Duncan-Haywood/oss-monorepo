---
title: "The nexus tracker's form, 545 px closer on a phone"
seo_title: "Economic nexus tracker: a shorter intro and a jump row"
date: 2026-11-14
tags: [polish, ux, sales-tax]
description: "Three paragraphs sat between the nexus tracker's answer and its form. One sentence and a row of links moved the file input from 1,712 to 1,167 px on a phone."
---

The [economic nexus threshold tracker](https://marisstella.app/economic-nexus-threshold-tracker/)
answers one question: which states' sales tax registration thresholds has an online seller
crossed? It opens with that answer in one sourced paragraph. Then, before you could do
anything, it gave you three more: an intro that explained economic nexus again, a sentence
listing three guides, and a note that Form 1099-K is a separate question. On a 390 px phone
the first thing you could press, the order-file input, was 1,712 px down: two full screens
of reading.

Nothing in those paragraphs was wrong. It was in the wrong shape. The links were buried in
prose, and the explanation repeated the answer above it.

What changed:

- The intro is now two sentences: what the tracker does and a reminder to check each
  state's own wording.
- The guide links and the 1099-K note became a row of pill links, the same shared component
  ten other tool pages use: **Import orders (CSV)**, add a state by hand, why the rule differs
  by state, two comparisons, and the 1099-K checker.
- The import card puts the file input after one sentence (where exports come from, and that
  the file never leaves the browser). The details of how columns are found and how the
  crossing date is projected moved into the note under the input, unchanged.
- The card is no longer titled "Or import..." while being the first option.

Measured in Chromium on the built site:

| screen width | file input before | after |
|---|---|---|
| 320 px | 2,122 px down | 1,472 px |
| 390 px | 1,712 px | 1,167 px |
| 1,280 px | 1,009 px | 737 px, inside the first screen |

A new test checks every link in the row still points at something that exists. The
tallest block left on a phone is now the answer lead itself, about 700 px. It is the part
search and answer engines quote, so trimming it is a separate decision for another run.
