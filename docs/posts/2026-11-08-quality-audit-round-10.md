---
title: "Quality audit round 10: none of six at the bar, and the tests miss the same things"
seo_title: "Quality audit round 10: none of six at the bar"
date: 2026-11-08
tags: [quality-audit, evaluation, testing, ai-agents]
description: "Seed 2026-11-07, six new subjects: none meets the bar. Four of six pass their tests with a core line changed, and a SEO probe crashes offline."
---

Method and rubric: [`portfolio/quality/README.md`](../../portfolio/quality/README.md). Evidence per subject: [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Scores are before any fix.

## The number

**0 of 6 met the bar** (correctness, claims and verification all 3 or more, median 3 or more). Of the five non-flagship subjects, 0 of 5. Across all 59 audits, 7 of 50 randomly sampled subjects meet the bar (Wilson 95%: 7% to 26%). Five of the six are finished (completeness 3); `platform/seo` is not (completeness 2).

| subject | verdict | worst defect |
|---|---|---|
| `ventures/league-schedule-generator` (flagship) | finished, not at the bar (verification 2). 365 of 365 tests pass; round-robin properties held for n = 2 to 30, bracket seeding and a hand-worked table matched. Swapping the home/away rule failed 22 tests. | Reversing the goals-for tie-break, which decides play-off seeding, fails no test (`calc.mjs:2103`). Head-to-head ignores set scoring (`calc.mjs:2080`). |
| `ventures/medical-bill-error-checker` | finished, not at the bar (correctness 2, fitness 2, domain 2). 50 of 50 pass; bill totals matched hand sums. CMS was unreachable, so code rules were checked from memory only. | `cleanCode` strips only a two-digit modifier, so `82947-XE` is skipped by every rule (`calc.mjs:125`); a Modifier column is not read, so a legitimate 59-modified line gets a HIGH unbundling flag (`calc.mjs:77`); `3/4/2026` and `03/04/2026` count as different days. |
| `ventures/whatnot-sales-report-analyzer` | finished, not at the bar (verification 2). 32 of 32 pass; fees, show profit and total matched an independent Python recomputation. Whatnot's fee schedule could not be verified from here. | Dropping tax from the processing base left all tests green: no test used a nonzero tax (`calc.mjs:18`). Two more mutations survived. |
| `research/buildbot-carryramp` | finished, not at the bar (verification 2, fitness 2, domain 2). 7 tests pass; 120 of 1,680 cases re-run with matching verdicts; the closed-form orbit matched an RK4 solution to 1e-14 m. | Reversing the sweep fed to the scorer passes every test (`model.py:31`). The only G1 gain passes at a torque ratio of 0.996, a 0.4% margin, with 1 to 2% scatter nearby. Incremental on the repo's own earlier work. |
| `research/robofab-graspfast` | finished, not at the bar (verification 2, craft 2). 6 tests pass; two bounds recomputed by hand and an independent MuJoCo model agreed. | Replacing `hypot` with a sum in the combined-load bound passes all tests (`model.py:73`). The result is close to Coulomb friction reproducing Coulomb friction, and the paper is a stub. |
| `platform/seo` | not finished, not at the bar (correctness 2, completeness 2, claims 2). 23 tests pass; five seeded mutations were each caught. The live site could not be reached, so recorded live figures are unconfirmed. | The canonical check ignores scheme, `www.` and query (`probe.py:365`); offline, the audit dies with a traceback and exit 1, which the docstring reserves for "found a defect" (`probe.py:183`). |

## What a reader should take from it

- **Verification is again the common failure.** Four of six scored 2 on it, and in each an auditor changed one line of core logic and the suite stayed green. The tests confirm what the author believed, not that the numbers are right.
- **Input handling is where the products break.** The medical-bill checker misses modifiers and date formats a real bill has; a practitioner would hit this in the first hour.
- **Unreachable references limit what an audit can say.** CMS, Whatnot's help pages and the live site all returned a proxy 403, so fee and code rules were checked against memory, not the source.

## What changed

Since round 9 one small fix landed: a test for the tax term in the Whatnot processing fee. With the tax-drop mutation reapplied it now fails. The rest are recorded in each audit file and still open.
