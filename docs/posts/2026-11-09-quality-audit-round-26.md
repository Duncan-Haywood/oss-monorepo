---
title: "Quality audit round 26: one of five sampled subjects meets the bar"
seo_title: "Quality audit round 26: one of five sampled subjects meets the bar"
date: 2026-11-09
tags: [quality-audit, evaluation, testing, research]
description: "Two ventures, two research projects and the sales-agent flagship: only the flagship and one venture meet the bar. Four of five had a mutant tests missed."
---

Method and rubric: [`portfolio/quality/README.md`](../../portfolio/quality/README.md). Evidence per subject: [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Scores are before any fix.

## The number

Of four randomly sampled subjects (two ventures, two research projects), **one meets the bar** (wise-statement-to-journal; 1 of 4, an interval of roughly 5% to 70%). The sales-agent flagship also meets it, narrowly, with the same scores as the previous day's audit. All five are finished (completeness 3).

## Subjects

| subject | meets bar | worst defect |
|---|---|---|
| `ventures/sales-agent` (flagship) | yes | numeric dates are read month-first with no flag ("12/11/2026" becomes 12 November); the opt-out check passes if "unsubscribe" appears anywhere; reply accuracy on unseen text is 37.5 to 66% by its own eval |
| `ventures/wise-statement-to-journal` | yes | a balance plug re-adds a lost FX line as "Rounding", so deleting the FX line from the journal passes all tests; overdrawn rows give a meaningless negative cost basis |
| `ventures/h1b-weighted-lottery-odds-calculator` | no (correctness, claims, verification 2) | the model draws the regular cap first and then the advanced-degree cap, which the auditor believes is reversed; the proxy blocked the rule text, so this is unconfirmed. Removing the first-draw factor from the advanced pool passes all 22 tests |
| `research/quantization-twin` | no (claims, verification 2) | the paper's threshold "state std about 1.5" is wrong (it is 2.29) and its own table contradicts the rule; changing `D*D/12` to `D*D/6` passed every test |
| `research/milestone-schedules` | no (verification 2) | scaling the (V-P) term of the reputation-side payoff by 1.1 survived all 8 tests; the paper cites none of the "starting small" literature |

Checks that were run: sales-agent 226 tests, wise 36, h1b 22, quantization-twin 6, milestone-schedules 8, all passing. Independent recomputation matched for every subject (h1b: a separate Newton solver agreed to about 1e-15; quantization-twin: own numpy code with a different seed within 0.5 points). Of the mutations seeded, the sales-agent ones were caught, and each of the other four subjects had a surviving mutant.

## What changed

The quantization-twin threshold is corrected in the README and paper, and a known-value test now catches the Sheppard mutant (that fix is in this round's PR). The rest are listed in each audit's defects. Not at the bar, plainly: three of five subjects, and the pattern repeats from earlier rounds: tests check what the author believed, not independent values. The h1b rule-order question needs someone to read the final rule before the calculator changes.
