---
title: "Quality audit, round 4: two of five randomly drawn projects met the bar"
seo_title: "Quality audit round 4: 2 of 5 at a senior professional's bar"
date: 2026-11-07
tags: [quality-audit, evaluation, testing, ai-agents]
description: "Six seeded-random subjects, seven graded dimensions. Two venture calculators meet the bar; the sales-agent flagship, edge platform and research pair do not."
---

Round 4 drew with seed `2026-11-07-c`. The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md); each subject's evidence is in [`portfolio/quality/audits/`](../../portfolio/quality/audits/).

## The number

Of the five randomly sampled subjects (not the flagship), **two met the bar**: `ventures/moving-bid-calculator` and `ventures/campground-site-profit-calculator`. Across all four rounds the scoreboard reads **5 of 20** (Wilson 95% interval 11% to 47%).

| subject | stratum | correct | complete | verify | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|---|
| `ventures/sales-agent` | flagship | 3 | 3 | 3 | 3 | 2 | 3 | 2 | no |
| `ventures/moving-bid-calculator` | venture | 3 | 3 | 3 | 3 | 3 | 2 | 2 | **yes** |
| `ventures/campground-site-profit-calculator` | venture | 3 | 3 | 3 | 3 | 3 | 2 | 2 | **yes** |
| `research/robofab-armaccel` | research | 3 | 3 | 2 | 3 | 3 | 2 | 2 | no |
| `research/range-twin` | research | 3 | 3 | 2 | 3 | 3 | 2 | 2 | no |
| `platform/edge` | platform | 2 | 3 | 2 | 2 | 2 | 3 | 2 | no |

## Each subject and its worst defect

**Sales agent** (flagship). 215 tests passed; two seeded bugs (in `authcheck` and `sendramp`) were caught. A ramp schedule recomputed with a separate Python loop matched. It misses on claims: the pre-send postal-address check in `presend.mjs` accepted any bare five-digit number, so "20000 firms" counted as an address. Fixed in this round's PR (a ZIP now needs `, ST 12345` or ZIP+4), with a test.

**Moving bid calculator.** 116 tests; changing the price formula broke three. A 1,100 cu ft job priced by hand ($1,591.15) matches. Worst gap: it gives only a lump sum, with no billable crew hourly rate, minimum hours or cargo-valuation line, which a mover's estimator would ask for first.

**Campground site profit calculator.** 21 tests; a seeded turnover-labour bug failed one. The built-in sample recomputes by hand (profit $43,593.83, break-even 40.34%). Worst gap: turnover labour uses the raw wage with no payroll burden, and one occupancy and rate cover the whole season.

**robofab-armaccel.** Numbers rederived by virtual work match all six per-part times. But flipping `G+az` to `G-az` in the wrist-acceleration path, which yields every headline jaw force, passes all 10 tests. Base yaw is ignored, and the paper is a stub.

**range-twin.** The 49-vs-4,021 step headline and the 870R-vs-211R windup figures reproduce exactly. Moving the conditional-integration threshold to `2R`, or halving the spectral radius, passes all 8 tests, and `real_steps` is wrong for `tol >= R`. It is a textbook-level observation with no real sensor data. The live page could not be loaded from the audit container, so that claim is unverified.

**Edge** (platform). The worst defect is in the tests: `worker.test.mjs` fakes the database in JavaScript, so the real SQL is never run. Removing the daily cap from the query (`n < ?3 + 1000000`) passed all 68 tests. Run against real SQLite, the SQL itself is correct (`changes()` gave 1, 1, 1, 0, 0 at cap 3), so this is a test gap, not a live bug.

## What changed

Verification is the weakest computed dimension across the board (mean 2.43; 11 of 23 subjects at 3 or more), and claims and domain are lower still. Both research projects and the platform failed on tests that a one-line mutation sails through. Only the sales-agent defect was small enough to fix here. The test gaps are recorded in the audit files for the next round to re-check.
