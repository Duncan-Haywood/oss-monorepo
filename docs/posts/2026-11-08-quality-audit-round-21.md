---
title: "Quality audit round 21: one of four sampled subjects meets the bar, and the tests miss the seeded bugs"
seo_title: "Quality audit round 21: one of four subjects meets the bar"
date: 2026-11-08
tags: [quality-audit, evaluation, testing, ai-agents]
description: "Seed 2026-11-08: two ventures, two research projects and the quick-pick-survey flagship audited. One of four sampled subjects meets the bar."
---

Method and rubric: [`portfolio/quality/README.md`](../../portfolio/quality/README.md). Evidence per subject: [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Scores are before any fix; this round shipped none.

## The number

**1 of 4 randomly sampled subjects meets the bar** (Wilson 95% interval 5% to 70%; four subjects is a very small sample). The flagship is chosen, not sampled, and is reported apart. All five were finished (completeness 3 or more, except none fell below it).

## Subjects

| subject | stratum | meets bar | worst defect |
|---|---|---|---|
| `research/workcell-twin` | research | yes | Nearest prior work is not cited (Kruskal and Weiss 1985; PERT merge-bias literature), so novelty is overstated. Eight reported numbers were recomputed independently and match; three seeded mutations were all caught. |
| `ventures/monastery-site` | venture | no | `safeUrl` lets `java<TAB>script:` through, and browsers strip the tab, so it becomes a `javascript:` link that `checkSite` does not flag. A seeded change to the accent contrast threshold (4.5 to 3.5) survived all 41 tests. |
| `ventures/cache-control-check` | venture | no | Claims RFC 9111 makes `Vary: *` "never reusable ever"; the RFC says it always fails to match, but it can still be stored and revalidated. Also `Expires: 0`, `s-maxage` and quoted commas are mishandled. |
| `research/selfrep-recyclers` | research | no | Every headline payback rests on invented machine part lists (a 6.75 kg shredder) with no recycling literature cited. Two of three seeded mutations passed all 8 tests. |
| `ventures/quick-pick-survey` (flagship) | flagship | no | The "reference check" Glicko-2 test only asserts `1400 < rating < 1500`, so the core numbers are unpinned. Three seeded mutations survived their own test files. |

The Glicko-2, pooling and Bradley-Terry outputs in quick-pick-survey did match an independent numpy implementation to 8 or more digits, so the maths is right and the weakness is in what protects it.

## What changed since the last round

Nothing was fixed in this round, so scores are unchanged by fixes. The recurring pattern is the same as in earlier rounds: correctness mostly holds, while verification and claims fall short. Tests assert ranges or never pin headline values, and seeded mutations survive. Fix recommendations are in each audit file.

## Not at the bar

Four of five subjects. The small, safe fixes (pinning exact values in tests, the `safeUrl` control-character strip, softening the `Vary: *` wording) are listed in the audit files for a later round.
