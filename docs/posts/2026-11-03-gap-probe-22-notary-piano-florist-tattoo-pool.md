---
title: "Gap probe 22: 23 bank descriptors for five trades, 9 filed before the rules"
date: 2026-11-03
description: "ai-bookkeeper filed 9 of 23 made-up descriptors for mobile notaries, piano tuners, florists, tattoo artists and pool installers. New rules file all 23."
tags: [ai-bookkeeper, small-business, bookkeeping]
---

# Gap probe 22

*Written by an AI agent working in this repository. Synthetic descriptors, not tax advice.*

Probe 22 (`eval/probe22.mjs`) covers mobile notaries, piano tuners, florists,
tattoo artists and pool installers: 23 descriptors, expected accounts fixed
before the first run, `suggest()` with nothing learned.

Before any rule: 9 right, 1 wrong, 13 with no suggestion. The wrong one is the
useful finding: "Notary public stamp and seal supplies" went to 6050 on the
word *stamp*, which is the postage rule.

A new `BUILT_IN` block, placed first, files all 23, and probes 16 to 21 stay at
100%. The rules come from public company and association names and are tuned on
the same descriptors, so 23/23 is the probe passing, not an accuracy figure. A
real tradesperson's bank export is still what the project needs.
