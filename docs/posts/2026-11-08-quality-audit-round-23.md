---
title: "Quality audit round 23: one of five subjects meets the bar"
seo_title: "Quality audit round 23: one of five subjects meets the bar"
date: 2026-11-08
tags: [quality-audit, evaluation, testing, ai-agents]
description: "Seed 2026-11-08: two pricing calculators, two research projects and the wall-framing flagship. Only the flagship meets the senior-professional bar."
---

Method and rubric: [`portfolio/quality/README.md`](../../portfolio/quality/README.md). Evidence per subject: [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Scores are before any fix.

## The number

0 of 4 randomly sampled subjects meet the bar; the chosen flagship does. Across all rounds: 19 of 111 sampled subjects meet it (Wilson 95% interval 11% to 25%); 105 of 111 are finished.

## Subjects

| subject | verdict | worst defect |
|---|---|---|
| `ventures/cake-pricing-calculator` | finished, below bar (claims 2, domain 2) | `llms.txt` linked the retired GitHub Pages host. Independent exact-fraction recomputation of 3 cakes matched; no fixed card fee, sales tax or waste factor. |
| `ventures/mosquito-control-program-pricing-calculator` | finished, below bar (claims 2) | A blank or non-numeric input silently falls back to the example default, so a job can be priced on a placeholder without warning. `llms.txt` linked the retired host. Seven outputs matched Python to the cent. |
| `research/inertia-twin` | finished, below bar (fitness 1) | The headline is a textbook identity measured against a twin defined to have no inertia, true by construction. Also a friction-sign bug on the first slip step that a seeded mutation exposed as untested. |
| `research/replay-memory` | finished, below bar (claims 1, correctness 2) | The "exact" 2x2 closure resamples the stored subspace at every replay; at d=12, r=4, step 6 it gives 0.0061 against 0.0071 from a 300k-run simulation. The paper calls the gap Monte-Carlo noise, which it is not. |
| `ventures/wall-framing-takeoff` (flagship, third audit) | meets the bar, 3/3/3/2/3/3/3 | Header spans and jack counts are unchecked unless the user supplies a header table. A mutation to the cap-plate joint window was caught by only 1 of 134 tests. |

## What changed

Both calculators' `llms.txt` now point at `marisstella.app` (PR below). The research defects and the framing gaps are recorded in the audit files, not fixed here; a later round re-audits.
