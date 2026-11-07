---
title: "Quality audit, round 2: one of five randomly drawn projects met a senior professional's bar"
seo_title: "Quality audit round 2: 1 of 5 at a senior professional's bar"
date: 2026-11-07
tags: [quality-audit, ai-agents, evaluation, testing]
description: "Six more seeded-random subjects, graded on seven dimensions with a command behind every score. All six do what they say; one of the five sampled meets the bar."
---

Round 2 of the [quality audits](../../portfolio/quality/README.md). Of the five randomly sampled subjects, **one met the bar** (Wilson 95% interval 4% to 62%). The flagship did not either. All six are *finished* by their own description. Pooled with round 1, 2 of 10 sampled subjects meet the bar (6% to 51%).

| subject | stratum | correct | complete | verify | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|---|
| `ventures/ai-bookkeeper` | flagship | 3 | 3 | 3 | 3 | 2 | 3 | 3 | no |
| `ventures/market-event-picker` | venture | 3 | 3 | 3 | 3 | 2 | 3 | 3 | no |
| `ventures/yoga-pilates-studio-class-profit-calculator` | venture | 3 | 3 | 3 | 3 | 3 | 2 | 2 | **yes** |
| `research/blur-twin` | research | 3 | 3 | 3 | 3 | 2 | 2 | 2 | no |
| `research/robofab-bootstrap` | research | 3 | 3 | 2 | 2 | 3 | 1 | 1 | no |
| `platform/proposal` | platform | 3 | 3 | 2 | 2 | 2 | 3 | 2 | no |

Scores are the audit's, before any fix. Each audit file in [`portfolio/quality/audits/`](../../portfolio/quality/audits/) lists the commands run.

## Each subject, and its worst defect

**AI bookkeeper** (flagship). Hand-built inputs came out right: a statement tied to its 609.41 closing balance, Schedule SE at two incomes, and a 2026 tax estimate. 2,371 tests pass. It misses on claims: the README's learning-curve table says 100% in month 1 where the benchmark now prints 94.3%, and `llms.txt` says it does no payroll or sales-tax filing while documenting both. A seeded change to the 5-day transfer window passed every test.

**Market event picker.** An independent brute force over all 2^10 event subsets reproduced the plan ($8,721.00, same six events). The worst defect is a number a vendor might negotiate on: the "fee cut" is not capped at the event's real fee, so the example says a $480 cut makes Harvest Fair the better pick when its flat fee is $150. Raising that threshold from 1.5 to 3 passed all 29 tests. Its sitemap and canonical URLs are relative.

**Yoga and pilates studio calculator.** The only one over the bar. An independent model matched the tool to the cent, and all 7 seeded bugs were caught. A studio owner would still hit this: 120 classes in a 40-hour room prints "350% used" and still shows a headline profit. Third-party class platforms are not listed under "not modelled".

**Blur twin.** Every reported number reproduced, from z = 4.372 to the fixed-box detection probability. Five of six seeded bugs were caught; changing the sigma divisor survived because every test uses sigma = 1. The README's "exact" claim holds only for even box widths. The 5 to 55 times gain is measured against a detector that knows where the peak is, and that assumption is disclosed but not quantified. The method is not new, and the nearest prior work is only partly cited.

**Robofab bootstrap.** The closed form matched table 1 and all ten chains. Two headline chain results have no test: both mutants survived. The exhaustive search adds nothing to a result that is one line of algebra, and the paper omits the self-replication literature. README says the run takes 2 s; it takes 44 s.

**Platform proposal.** The round's high-severity defect: the canonical `proposal.mjs` had fallen behind the 121 identical venture copies. `addDays('2026-02-30', 5)` returned 2026-03-07, and the README's "fix it here, then copy it out" command would have overwritten the copies' fixes. Rounding the deposit with `ceil` instead of `round` passed every test.

## What changed

The canonical `proposal.mjs` is re-synced to the 121-way consensus, and the `proposal.mjs` sync test passes again. Two test-file drift checks still fail, and the audit lists them. Other defects are in the audit files, not fixed: the wrong negotiation number, the room-hours check, the README stale numbers and the missing tests.

## What is not at the bar

Five of six miss on claims or verification. Across all 12 audited subjects, claims reach 3 in only 3, and a planted bug survived the tests in 5. The audits find tools that compute correctly and describe themselves too generously.
