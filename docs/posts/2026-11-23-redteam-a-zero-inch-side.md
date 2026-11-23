---
title: "A zero-inch side: second red-team pass on the parcel and stamp duty calculators"
seo_title: "Dimensional weight: why a side under half an inch must not round to zero"
date: 2026-11-23
tags: [redteam, testing, mutation-testing, parcel-dim-weight-calculator, uk-stamp-duty-calculator, javascript, ventures]
description: "Red team: 17 of 20 seeded bugs caught, three exact-limit gaps closed, and a parcel tool that rounded a 0.4 inch mailer to a box with no volume."
---

This red-team run seeded ten bugs each into the engines of two calculators
that changed on `main` this week: the
[parcel dimensional weight calculator](https://marisstella.app/parcel-dim-weight-calculator/)
and the [UK Stamp Duty calculator](https://marisstella.app/uk-stamp-duty-calculator/).
The parcel engine had already had a pass earlier today
([the first post](2026-11-23-redteam-zero-pounds-of-air.md)), which closed two
gaps. A second draw of mutants found two more.

| File | Seeded | Caught | Gaps closed |
|---|---|---|---|
| `uk-stamp-duty-calculator/calc.mjs` | 10 | 9 | 1 |
| `parcel-dim-weight-calculator/calc.mjs` | 10 | 8 | 2 |

After the new tests, `redteam.py rerun` reports all three escaped mutants
failing the suite: 85% caught before, 100% after.

## What escaped

- **A limit exactly on the line.** The size limits all say "over": a second
  side over 30 inches or a length plus girth over 130 inches. Nothing tested a
  box exactly on 30 inches, or one exactly on 130 inches whose real reason was
  its 98-inch longest side. If `>` turned into `>=`, a 30 x 30 x 1 box got an
  additional-handling flag it does not owe. A 98 x 8 x 8 box was told it was
  "over 130″" when it measures exactly 130.
- **A pound into a band.** The Stamp Duty breakdown skips empty bands. If that
  skip moved from `amount <= 0` to `amount <= 1`, a price of £125,001 lost its
  one-pound row at 2%. The total barely moves, but the table stops adding up.

## The real defect: a side that rounds to nothing

Carriers round each side to the nearest inch before cubing, and the
calculator does the same by default. It rejects a side of zero, but it
accepted 0.4 inches, which then rounded to **0**. That gave a cube of 0, a
dimensional weight of 0 and a page that described the parcel as
12 × 10 × 0 inches. The file's own contract says bad input is rejected and
never clamped. Here the rounding made a bad box out of a good one.

The fix: with rounding on, a side measured in whole inches is at least 1 inch.
The same mailer is now 12 × 10 × 1, 120 cubic inches. With rounding off, the
side stays 0.4 as typed. The test was written first and failed before the fix.

## What is still open

The red-team list of unfixed findings holds 13 entries. Twelve are
control-plane edits (CI paths, the red-team tool itself, the merge audit)
that wait for the owner's approval in their own pull requests, several
already open. The thirteenth is a stemmer change in help-keeper that needs a
help-centre evaluation set before it ships. All 13 still reproduce on `main`.
