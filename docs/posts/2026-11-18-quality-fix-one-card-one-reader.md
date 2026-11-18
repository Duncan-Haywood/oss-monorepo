---
title: "Quality fix: a memory card can only be in one reader at a time"
seo_title: "How many card readers to back up multi-camera footage overnight"
date: 2026-11-18
tags: [quality-audit, research, testing]
description: "The capture-storage backup model let card readers share one card. Fixed, a four-camera rig needs 4 readers and about 400 g, not 6 and 452 g."
---

This was a `fix` session of the [quality programme](../../portfolio/quality/README.md).
The mode draw picked fix because 18 high-severity defects were open. This session
took one of them, from the
[2026-11-17 audit](../../portfolio/quality/audits/2026-11-17-capture-storage.json)
of [`research/capture-storage`](../../research/capture-storage/README.md). That project
asks how much footage a multi-camera travel kit makes, and what it takes to back the
footage up each evening.

## What was wrong

The optimiser worked out the evening copy time as *one day's bytes ÷ (readers × 90 MB/s)*.
That treats reader bandwidth as something you can split as finely as you like. A card
sits in one reader at a time, though. Every plan the model reported used more readers
than there were cards. For one 360 camera it gave 1 card and 2 readers. So the headline
"6 readers, 4 SSDs, 452 g" for a four-camera rig was not a kit anyone could pack. The
model also read every card twice, once for each SSD copy. Offload tools don't work that
way: they read the card once and write both copies as the bytes go past.

## What it does now

- **Whole cards go on readers.** The largest card goes first, onto whichever reader is
  least busy (the LPT rule). That is a schedule a person can actually follow, and it is
  never more than a third longer than the best possible order. There are never more
  readers than cards.
- **Read once, write both copies.** This is the default now. `reads="per-copy"` keeps
  the old two-pass model so the two can be compared.
- **An SSD floor.** The evening can't be shorter than the time one SSD needs to take in
  the whole day, at an assumed 400 MB/s.

For the four-camera rig (4 h a day, a week, 1 h copy limit) the lightest plan is now
5 cards of 256 GB, 4 SSDs and 4 readers, 402 g in all. The copy takes 0.89 h, because the
reader holding the 180 GB and 108 GB cards finishes last (288 GB at 90 MB/s). Six new tests
cover the schedule, and one pins this plan against the hand arithmetic. The [README](../../research/capture-storage/README.md)
shows the arithmetic.

| 4 h/day, 7 days, 1 h limit | old model | fixed (read once) | read once per copy |
|---|---|---|---|
| 1 camera | 160 g, 2 readers, 1 card | 135 g, 1 reader | infeasible |
| 4 cameras | 452 g, 6 readers, 5 cards | 402 g, 4 readers | infeasible |
| 7 cameras | infeasible | 603 g, 6 readers | infeasible |

Two results are new. First, **the copy method matters more than the gear**. If you read
the cards once per backup copy, no rig of 1 to 8 cameras fits in an hour. Read them once
and write both copies, and up to seven cameras fit. Second, **a spare card per camera is
worth a reader**. Swapping cards at mid-day splits the biggest loads, which takes the
four-camera rig to 379 g with 3 readers.

The project's main finding stands: copy time is what limits the kit, not the weight of
the cards. The fix makes it stronger.

## What else turned up

- The same divisible-reader model had been copied into
  [`capture-kitstore`](../../research/capture-kitstore/README.md), which picks cameras and
  storage together. Its storage figures have not been regenerated. That is now recorded
  in a known gap at the top of its README.
- Four seeded bugs were tried against the new model. The tests caught three: dropping
  the per-copy factor, putting every card on reader 0, and weakening the SSD floor. The
  fourth, allowing more readers than cards, survives, because it is equivalent: an idle
  reader only adds grams, so the search never picks one.
- Still open from the audit: no prior work on how digital imaging technicians handle
  offloads is cited, a few `PARAMS` rows are never read, and the device rates are
  assumed. The audit scores stay as they were. A later round re-audits.

Every device figure here is assumed or a bus ceiling, not a bench measurement. Time a
real copy with your own readers and hub before you rely on a plan.
