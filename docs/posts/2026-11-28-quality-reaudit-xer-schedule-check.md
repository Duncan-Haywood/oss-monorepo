---
title: "Re-audit: the XER checker now scores BEI against a real baseline, and its tests still miss three seeded bugs"
seo_title: "DCMA BEI and missed tasks in P6: planned dates are not a baseline"
date: 2026-11-28
tags: [quality-audit, evaluation, construction, scheduling, xer-schedule-check]
description: "A re-check of XER Schedule Check against its 2026-11-19 audit. The baseline gap is closed and five of nine defects are fixed; verification still misses the bar."
---

[XER Schedule Check](https://marisstella.app/xer-schedule-check/) runs the DCMA
14-point assessment on a Primavera P6 XER file in the browser, without a P6
seat. The [2026-11-19 audit](../../portfolio/quality/audits/2026-11-19-xer-schedule-check.json)
found nine defects. The worst was in points 11 (missed tasks) and 14 (BEI):
it measured them against P6's planned dates. P6 resets those dates to the early
dates for every activity that hasn't started, each time it schedules. So late work
that never started was never counted as due or missed: 0 of 11,775 on the
public CCA file. This re-check tested all nine defects against the code on
`main` today. The full record is in the
[re-audit file](../../portfolio/quality/audits/2026-11-28-xer-schedule-check.json).

**Verdict: still below the bar, now only on verification.** Correctness, claims
and domain score 3. Verification scores 2.

## Why planned dates are not a baseline

If you review contractor updates, this matters outside this tool too. DCMA's
BEI is *activities finished to date / activities the baseline had due by the
data date*. A P6 update without its baseline has only planned dates
(`target_end_date`), and P6 moves them for unstarted work. An update can be
weeks behind and still score BEI 1.0 on planned dates. You need the
baseline XER. The tool now takes one: open it next to the update on the page,
or pass `--baseline` on the command line. Activities are matched by activity ID.

To check that, we built a baseline from the CCA file in which every unstarted
activity was due before the data date, then counted DCMA 11 and 14 with our own
script. Both gave the same result: **13,228 due, 11,694 missed (88.4%), BEI
0.116**. On planned dates the same file reads 2,316 due and BEI 0.662.

## What the fixes closed

| earlier defect | on arrival |
|---|---|
| missed tasks and BEI on planned dates, no way to load a baseline (high) | **closed**: baseline file on the page and CLI; matches an independent count |
| FAQ said planned dates equal the baseline (medium) | **closed** |
| README credited unit tests that did not exist (medium) | **closed** (the replacement line understated one test; corrected here) |
| CLI stack traces on bad input (low) | **closed**, though the earlier audit had not marked it |
| CLI rounded BEI to one decimal (low) | **closed** |
| points with nothing to measure scored PASS (medium) | **open** |
| 7 of 9 seeded bugs survived the tests (medium) | **open on arrival**; this round's tests catch 4 of the 7 |
| every start/finish milestone exempt from point 1 (low) | **open** |
| LOE and WBS-summary predecessors counted in points 2-4 (low) | **open** |

## What we recomputed

- DCMA points 1-8 on four public XERs (Expressway, CCA, hotel, terminal) with
  our own Python counter: **40 of 40 counts identical**.
- CPLI on a hand case: 20 working days of critical path, must-finish date 5 days
  early, so (20 - 5) / 20 = **0.75**. The tool gives the same.
- The tool's own schedule calculation against P6's stored dates on CCA:
  14,268 of 14,270 open activities agree.
- The page in Chromium at phone width, on the 30 MB CCA file with the baseline:
  scorecard in 2.4 s, no requests leave the page.

## What is still not at the bar

- **The headline pass count includes points that had nothing to measure.** On
  Expressway, "8 of 14 pass" counts missed tasks (0 of 0), BEI (n/a) and CPLI
  (set to 1 because there is no must-finish date). A scheduler should read
  three of those eight as n/a.
- **Seeded bugs still survive.** On arrival the same seven of nine survived as
  on 2026-11-19. New tests in `dcma-thresholds.test.mjs` test each threshold
  just above and just below its line for points 6, 7, 13 and 14, and those four
  bugs now fail a test. Three still pass every test: point 12's 600-day margin
  cut to 300, the start-to-finish backward lag dropped, and the start-float
  branch swapped.
- Point 1 exempts every milestone, not just the project's start and finish.
  Points 2-4 count 698 links out of LOE or WBS-summary activities on CCA, which
  takes the FS share from 85.0% to 84.0%.

The open items are listed in the product's `NEXT.md`. Each changes a published
score across the page, CLI, written report, ribbon and trend views, so each
needs its own change.

*Screening metrics, not a verdict on a schedule. Not affiliated with Oracle
or the DCMA.*
