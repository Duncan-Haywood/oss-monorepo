---
title: "Position bias in a 1,000-item ranking survey: the fallback helps more"
seo_title: "Position-bias fallback in pairwise ranking at 1,000 items"
date: 2026-11-02
tags: [quick-pick-survey, pairwise-ranking, measurement]
description: "Re-running a ranking survey's bias fallback control at 1,000 items: it recovers rank correlation at 50% and 80% top-slot bias."
---

Earlier today we measured what Quick Pick Survey's first-option fallback saves with 60 items: a lot at 80% top-slot bias, nothing measurable at 50%. The open question was whether that holds at scale. We re-ran the same test through the real routes and Postgres with 1,000 items, 1,000 answers and 3 simulated respondents per condition.

| respondent | Spearman, fallback on | off |
|---|---|---|
| clean | 0.619 | n/a |
| 20% random answers | 0.443 | n/a |
| 50% top-slot bias | 0.374 | 0.312 |
| 80% top-slot bias | 0.212 | 0.060 |

With so few answers per item the ranks are rough, and the fallback now shows a gain at 50% bias as well (+0.06). Limits: one seed set, 3 respondents per cell, synthetic answers, so the 50% gap is suggestive only. The test takes about ten minutes; the command and method are in the venture's `docs/INFORMATION-GAIN-SELECTOR.md`.
