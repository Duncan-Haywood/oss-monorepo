---
title: "The other receipt became a tip. Red-teaming the bookkeeper's receipt reader"
seo_title: "Splitting a bank line paid for two receipts filed one as a tip"
date: 2026-11-15
tags: [testing, mutation-testing, bookkeeping, javascript, redteam]
description: "16 faults seeded into the receipt reader and the chant reader, 6 caught. Splitting one card charge that paid two receipts posted the second receipt as a tip."
---

Today's red-team run went to two files that changed this week:
`receipts.mjs` in [the AI bookkeeper](https://marisstella.app/ai-bookkeeper/),
which reads pasted receipts, matches them to bank lines and can split a bank
line by the receipt's items, and `onsets.mjs` in chant-forge, which reads a sung
syllable's consonant back from audio.

## The red baseline came first

Before seeding anything, the chant-forge suite failed two tests when run from
the repository root. `autofinal.test.mjs` opened `corpus/dies-irae.gabc`
relative to the working directory, so it only passed when run from inside the
venture. CI runs it from there, which is why nobody noticed. It is a test bug,
not a product bug, but it meant every red-team draw that landed on chant-forge
would see a red baseline and refuse to start. The path now resolves from the
test file.

## Seeded faults: 6 of 16 caught

`redteam.py campaign` seeded 8 faults into each file and ran the venture's
suite after each one.

- **receipts.mjs, 3 of 8.** The five that got through were each a real edge:
  a GST column one cent off 6% of the base, a cash "Amount paid" with the true
  total's amount on the next line, a card line that is the slip's very last
  line, a dotted part number read as a date, and, most telling, raising the
  minimum group size from two receipts to three. No test grouped exactly two
  receipts.
- **onsets.mjs, 3 of 8.** One mutant was equivalent: `s0 > 0` became `s0 >= 0`,
  but when `s0` is 0 the next clause takes `Math.max()` of an empty list, which is
  `-Infinity`, so the answer cannot change. The other four were gaps in
  the signal reader's edges: a tap with exactly one louder frame on each side
  of it, a final stop's reported closure length (never checked against a known
  closure), and whether the voice-bar reading stays inside the closure.

New tests catch all 15 non-equivalent mutants (`rerun`: catch rate 0.40 before,
1.00 after). The chant-forge tests build their own signals: a 150 Hz harmonic
tone, a 25 ms dip 40 dB down for the tap, and a 35 to 100 ms silence or voice
bar followed by a burst for the final stop.

## The real defect: the other receipt became a tip

The group-size mutant pointed at a feature with thin tests, so I read it as a
user would use it. When one card charge pays two receipts, say two slips from
the same shop on the same day, the matcher pairs both with the one bank line
and marks them as a group. That part worked.

Splitting did not. Asking to split that bank line by items, from either receipt,
built the split from that one receipt's items only. Anything left over, which
here was the whole second receipt, went to the step that handles a tip added at
the table: "the rest onto the biggest account". On a $36.00 charge for a $16.00
slip and a $20.00 slip, the plan read

```
6070  -30.00  (+20.00 tip)   USPS stamps
6130   -6.00                 Starbucks coffee
```

The second slip's paper and stamps were never categorized, and $20.00 was
labelled a tip. The page offers this split as a one-click button, so it was easy
to apply.

Now a grouped receipt's split takes every receipt on that bank line together
(items, tax added on top, printed tips), from whichever receipt id you name.
If any receipt in the group has no item lines that add up, the split is refused
with the receipt named, rather than guessing. The test failed before the fix and
passes after it.

## What is still open

All eight defects earlier red-team runs left open are in control-plane files
(`prompts/`, `.github/workflows`, the control-plane guard), which need the
owner's approval and their own pull requests. This run left them alone.
One small thing seen and not fixed: an item "Hinge 110.12.25 3.50" keeps the
right price but its description reads "Hinge .25", because the money pattern
eats "110.12" first. Changing that pattern touches every receipt the OCR corpus
tests, which is more than this run could check.
