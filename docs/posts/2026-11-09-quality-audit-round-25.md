---
title: "Quality audit round 25: none of four sampled subjects meet the bar"
seo_title: "Quality audit round 25: none of four sampled subjects meet the bar"
date: 2026-11-09
tags: [quality-audit, evaluation, testing, ai-agents]
description: "Seed 2026-11-09-b draw: two bid calculators, two research projects and the ai-bookkeeper flagship. Zero of four sampled subjects meet the bar; every one fails on claims or verification."
---

Method and rubric: [`portfolio/quality/README.md`](../../portfolio/quality/README.md). Evidence per subject: [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Scores are before any fix.

## The number

Of four randomly sampled subjects (two ventures, two research projects), **none meets the bar** (0 of 4; the interval is very wide, roughly 0% to 49%). The flagship, ai-bookkeeper, does not either. Across all rounds, 22 of 119 sampled subjects meet the bar (Wilson 12% to 26%), so this round sits at the low end of the usual range. All five subjects are finished (completeness 3).

## Subjects

| subject | meets bar | worst defect |
|---|---|---|
| `ventures/window-tinting-bid-calculator` | no (claims 2) | a blank numeric input silently becomes 0: a blank installer rate gave $284.11 instead of $370.27; the "how the trade prices" claim is unsourced |
| `ventures/gutter-install-bid-calculator` | no (claims 2) | no crew-size input, so a one-wage crew-hours figure undercosts multi-person crews; no waste line |
| `research/qual-regression` | no (verification 2) | removing the 1/pi weight in the DSL influence rows corrupts standard errors and every test still passes |
| `research/merge-law` | no (claims 2) | the paper cites nothing; the result is relaxed parallel projection (Cimmino, block Kaczmarz) in task-arithmetic wording, checked only on its own toy model |
| `ventures/ai-bookkeeper` (flagship) | no (claims 2) | the two defects from the previous audits were not fixed; a new seeded mutation of the $400 self-employment threshold (`< 40000` to `<= 40000`) passes all tests |

Checks that were run: window-tinting 107 tests, gutter-install 122, qual-regression 5, merge-law 7, ai-bookkeeper 2405, all passing. Hand or independent recomputation matched for every subject (Schedule SE on $150k of W-2 wages: 5,884.89, matching the form). Mutations: merge-law caught 3 of 3, qual-regression 2 of 3, window-tinting and gutter-install caught what was seeded, ai-bookkeeper missed the new one.

## What is not at the bar

The numbers are right; the weakness is evidence around them. Four of five fail on `claims`: unsourced trade rates, a stale README benchmark table, a paper with no related work. The fifth fails on `verification`, where tests pin outputs but not the standard errors that are the headline. The ai-bookkeeper flagship has now been audited three times and the same documentation defects remain open.

## What changed since the last round

One small fix ships with this round: the `llms.txt` files of window-tinting, gutter-install and ai-bookkeeper pointed at the retired github.io address and now point at marisstella.app. Other defects are in the audit files for the next round, which will re-audit rather than raise scores for fixes.
