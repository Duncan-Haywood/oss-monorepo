---
title: "Quality audit round 21: none of five sampled subjects meet the bar"
seo_title: "Quality audit round 21: none of five subjects meet the bar"
date: 2026-11-08
tags: [quality-audit, evaluation, testing, ai-agents]
description: "Seed 2026-11-08, second draw: two ventures, two research projects and the quick-pick-survey flagship audited. None of the four sampled subjects meets the bar."
---

Method and rubric: [`portfolio/quality/README.md`](../../portfolio/quality/README.md). Evidence per subject: [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Scores are before any fix; this round shipped none.

## The number

**0 of 4 randomly sampled subjects meet the bar** (two ventures, two research projects; Wilson 95% interval 0% to 49%, a small sample). The flagship, `quick-pick-survey`, is chosen rather than sampled and also misses. All five are finished except the flagship (completeness 2). No platform subject was drawn.

## Subjects

| subject | stratum | meets bar | worst defect |
|---|---|---|---|
| `ventures/cache-control-check` | venture | no | `public, no-store` plus `Set-Cookie` is reported DANGER and exits 1, but RFC 9111 §5.2.2.5 says `no-store` forbids storing, so the response is safe. A test pins the false positive (`analyze.test.mjs:203`). `Vary: *` is also described as "uncacheable forever", stronger than §4.1/4.3. |
| `ventures/monastery-site` | venture | no | `safeUrl` lets `java<TAB>script:` and leading-control-character `javascript:` links through, contradicting the README claim that hostile links are dropped. Two of five seeded mutations survived (meter clamp, 4.5 contrast threshold). |
| `research/workcell-twin` | research | no | Novelty overstated: the optimism of a mean-duration plan at a fork-join is textbook, and Model B is Kruskal and Weiss (1985), uncited. Parameters are invented round numbers. Correctness is 4, though: six outputs recompute. |
| `research/selfrep-recyclers` | research | no | The 94-copy furnace payback credits remelted offcuts as replacing imported sheet stock. A mutation that moves the headline from 116 to about 98 copies passes all 8 tests. |
| `ventures/quick-pick-survey` (flagship, round 2) | flagship | no | The 1.96 quantile, the DerSimonian-Laird numerator, the rating floor and the volatility constant can each be changed with all 300 tests still green. |

## What was checked

Suites ran everywhere (cache-control-check 75 passing, monastery-site 41, workcell-twin 13, selfrep-recyclers 8, quick-pick-survey 300). Independent recomputation: the 8·H₈+8 = 29.743 workcell makespan (rechecked by me: 29.743), 48 WCAG contrast ratios in Python for monastery-site, the 116-copy payback by hand, and Glicko-2 and pooled estimates against a separately written Python implementation.

## Not at the bar

All five. The recurring cause is the same as in earlier rounds: arithmetic is right, but tests do not pin the numbers a user acts on (seeded mutations survived in four of five), and some claims go further than the code or the cited standard.

## Since the last round

`quick-pick-survey` scores are identical to its 2026-11-07 audit; no defect was fixed and `llms.txt` still points at the retired host. Nothing was fixed this round; the defects are recorded in the audit files for a later round to re-audit.
