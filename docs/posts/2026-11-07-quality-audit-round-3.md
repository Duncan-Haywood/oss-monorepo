---
title: "Quality audit, round 3: again one of five randomly drawn projects met the bar"
seo_title: "Quality audit round 3: 1 of 5 at a senior professional's bar"
date: 2026-11-07
tags: [quality-audit, ai-agents, evaluation, testing]
description: "Six seeded-random subjects, seven graded dimensions. Five do what they say; the one that met the bar is a statistics result, and the flagship did not."
---

Round 3 drew with seed `2026-11-07-b` (rounds 1 and 2 used the bare date; a parallel round 2 landed while this one ran, and drew ai-bookkeeper too, so this round's independent ai-bookkeeper audit is kept at [`docs/reports/2026-11-07-ai-bookkeeper-second-audit.json`](../reports/2026-11-07-ai-bookkeeper-second-audit.json) and not double-counted in the scoreboard). The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md); each subject's evidence is in [`portfolio/quality/audits/`](../../portfolio/quality/audits/).

## The number

Of the five randomly sampled subjects (not the flagship), **one met the bar**: `research/precision-scores`. The flagship, `ventures/ai-bookkeeper`, did not. Counting this round's five sampled subjects with the earlier ones, the scoreboard reads 3 of 15 (Wilson 95% interval 7% to 45%).

| subject | stratum | correct | complete | verify | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|---|
| `ventures/ai-bookkeeper` | flagship | 3 | 3 | 3 | 3 | 2 | 2 | 3 | no |
| `ventures/lash-studio-profit-calculator` | venture | 3 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| `ventures/amazon-seller-profit-analyzer` | venture | 2 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| `research/precision-scores` | research | 4 | 3 | 3 | 3 | 3 | 2 | 3 | **yes** |
| `research/accel-kwssparse` | research | 2 | 3 | 2 | 2 | 2 | 2 | 2 | no |
| `platform/audio` | platform | 3 | 2 | 2 | 3 | 2 | 3 | 3 | no |

## Each subject and its worst defect

**AI Bookkeeper** (flagship). 2,371 tests pass. A seeded bug (period-end `>` changed to `>=` in `ledger.mjs`) broke 12 of them. Self-employment tax on $100,000 recomputes to $14,129.55 (92,350 × 15.3%). It misses on claims: `llms.txt` said the product "does not do payroll" while `payroll.mjs` ships Form 941/940 worksheets, and the README promised payees "post themselves from the second month", where the author's own benchmark shows 7.2% in month 2 and about 43% in month 4. Both claims were corrected in this round's PR. Not fixed: 96 cells of the 10-, 15- and 20-year MACRS tables differ from IRS Pub. 946 by 0.01 to 0.05 points, and no reader has been tried on a real bank export.

**Lash studio profit calculator.** The seeded bug (monthly profit as weekly × 4 instead of × 52/12) passed all 23 tests: the monthly figure, weekly figures and CSV have no assertions. Client lifetime uses only the first set and first fill type. `llms.txt` points at retired github.io addresses.

**Amazon seller profit analyzer.** The worst defect is a wrong number: "referral fees Amazon kept" ignores quantity, so a partial refund of a 2-unit order shows $3.96 where the correct figure is $0.66. The waterfall also omits the regulatory fee, so its lines are off by $0.04 from "Paid out", and a seeded bug survived all 23 tests.

**Precision scores** (met the bar). Recomputations agreed (the efficiency loss at condition number 100 is 4κ/(1+κ)² = 0.0392), and all six seeded mutations were caught. It is not new: the bound is the classical Watson / Bloomfield-Watson result, and the write-up cites nothing. The finite-sample figures come from one covariance with no standard errors.

**Accel-kwssparse.** Correctness is capped at 2 because the 3.3 GB feature set is not available, so the accuracies were not reproduced. Of three seeded mutations only one was caught; no test pins an energy value. The ternary and binary failure comes from an untuned recipe on a weak baseline, and is expected from the literature.

**Audio** (platform). A seeded +0.8 dB gain bug in `master()` passed all 24 tests, because the loudness test allows ±1 LU and the output already lands 0.3 to 0.4 LU under target. Silent input is accepted without error, and no workflow runs `test_narrate.py`.

## What changed since earlier rounds

Same share meeting the bar, and the same pattern: arithmetic is mostly right and what fails is **claims** and **verification**. A deliberately planted bug survived the suite in 4 of this round's 6 subjects (lash studio, amazon seller, accel-kwssparse in part, audio), against 3 of 6 in round 1. Re-audits are separate files. Not at the bar: five of these six, the flagship included. Nothing here raises a round 1 score; re-audits are separate files.
