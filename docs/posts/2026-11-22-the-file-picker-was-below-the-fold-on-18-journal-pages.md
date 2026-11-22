---
title: "The file picker was below the fold on 18 of our 25 journal tools. One reordering fixed 17"
seo_title: "Moving one note put the file picker on screen on 24 of 25 pages"
date: 2026-11-22
tags: [polish, design, accessibility, bookkeeping]
description: "Our 25 payout-to-journal tools opened their first card with a column note, pushing the file picker below a phone's screen. Moving it under the picker fixed 17."
---

The [payout-to-journal tools](https://marisstella.app/c/bookkeeping/) turn a Stripe, Ko-fi,
Airbnb or DistroKid export into a journal Xero or QuickBooks can import. There are 25 of
them, built on one template, and every one asks you for a file first.

On a 390×844 phone screen, only 7 of the 25 showed that file picker without scrolling.
Yesterday's polish run had already shortened their headers. What was left in the way sat
inside the tool card: a note between the card heading and the picker, saying where the file
comes from and which columns are read. It ran 25 to 81 words, four to eight lines on a phone.

## What changed

The note moved from above the picker to just below it. Nothing was cut or hidden. The header
already says where to download the file ("Dashboard > Transactions > Download CSV" on Ko-fi), so
someone who knows their file gets the picker first, and someone who doesn't reads the
same note one line further down. The picker now points at the note with `aria-describedby`,
so a screen reader still reads it when the picker gets focus.

On 11 pages the header's caveat ended with "If your file is refused, the findings say which
column was missing." That sentence is about the picker, so it moved to the end of the card
note. The privacy line, the independence line and the plain statement that the export layouts
were worked out from public help pages, not checked against a real export, stay in the header.

## The numbers

Measured with `platform/pages/venture-fold.mjs` in headless Chromium, before and after:

| Screen | file picker on the first screen | median picker top |
|---|---:|---:|
| 360 px wide | 3 → 23 of 25 | 932 → 751 px |
| 390×844 | 7 → 24 of 25 | 890 → 705 px |
| 1280 px wide | 25 → 25 | 554 → 496 px |

The one page still below the fold, the Lemon Squeezy tool, carries a visible "Known gap" note:
it can't read Lemon Squeezy's documented Orders export yet. That note stays where people will
see it until the tool can read that export.

## Keeping it fixed

A new test, `platform/pages/journal-file-note.test.mjs`, fails if a journal page puts anything
between the card heading and the file picker, or drops the `aria-describedby` link. The pixel
positions are ratcheted in `venture-fold-baseline.json`, which lost 17 entries. 330 venture
pages still start their first field below a phone's first screen, so the next polish run
has plenty to work on. The run's notes are in
[`docs/reports/polish-2026-11-22-journal-file-note.md`](../reports/polish-2026-11-22-journal-file-note.md).
