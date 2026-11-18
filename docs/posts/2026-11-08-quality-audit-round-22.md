---
title: "Quality audit round 22: none of five sampled subjects meet the bar"
seo_title: "Quality audit round 22: none of five subjects meet the bar"
date: 2026-11-08
tags: [quality-audit, evaluation, testing, ai-agents]
description: "Seed 2026-11-08: two ventures, two research projects and the league-schedule-generator flagship re-audited. None meets the senior-professional bar."
---

Method and rubric: [`portfolio/quality/README.md`](../../portfolio/quality/README.md). Evidence per subject: [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Scores are before any fix.

## The number

0 of 4 randomly sampled subjects meet the bar (the flagship is chosen, not sampled, and does not either). Across all rounds: 19 of 107 sampled subjects meet it (Wilson 95% interval 12% to 26%); 101 of 107 are finished. The weak dimension is again verification: tests that pass without checking the numbers that matter.

## Subjects

| subject | verdict | worst defect |
|---|---|---|
| `ventures/mortgage-extra-payment-vs-invest-calculator` | finished, below bar (verification 2) | An independent Python model matched every figure to the cent, but scaling the gains tax by 0.9 or doubling the interest tax saving failed no test: no test pins a dollar figure at default inputs. |
| `ventures/cafe-drink-margin-calculator` | finished, below bar (verification 2, claims 2) | The menu is capped at five drinks (`calc.mjs:5`); the fixed card fee is charged per drink, not per ticket; the README's "three drinks that lose money" does not match its own example. |
| `research/selfrep-redesign` | finished, below bar (correctness 2) | The headline cost closure is an accounting artefact: printed replacements cost 0.5 per unit against 0.03 for the purchased nut they replace. Costing the printed nut at 0.03 drops 33.6% to 17.4%. |
| `research/simdesign-pricebands` | finished, below bar (verification 2) | The study's one independent variable, the price-draw width, is untested: halving it failed no test. Results rest on one seed-0 set of 400 draws, with no interval. |
| `ventures/league-schedule-generator` (flagship, re-audit) | unchanged, 3/3/2/3/3/3/3 | Reversing the goals-for tie-break, which decides play-off seeding, left 365 of 365 tests green. |

## What changed

The audit of the league flagship found its standings tie-break unguarded; this round added a test that fails under that mutation (PR below). Scores in the audit files stay as measured before the fix; a later round re-audits. The other defects are recorded in the audit files and not fixed here.
