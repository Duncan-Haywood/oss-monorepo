---
title: "Quality audit round 16: one of five sampled subjects meets the bar, and none of the research projects do"
seo_title: "Quality audit round 16: one of five subjects meets the bar"
date: 2026-11-08
tags: [quality-audit, evaluation, testing, ai-agents]
description: "Seed 2026-11-08: the sales-agent flagship meets the bar narrowly. Both ventures, both research projects and the counter platform do not."
---

Method and rubric: [`portfolio/quality/README.md`](../../portfolio/quality/README.md). Evidence per subject: [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Scores are before any fix.

## The number

**0 of 5 randomly sampled subjects met the bar** (two ventures, two research projects, one platform directory). The flagship, `ventures/sales-agent`, met it narrowly. All six are finished (completeness 3). Across all 91 audited subjects, 13 of 79 randomly sampled ones meet the bar (Wilson 95%: 10% to 26%).

## Subjects

- **`ventures/sales-agent` (flagship): meets the bar, narrowly.** 219 of 219 tests pass, plus 25 of 25 in `self-host/`. Ramp-planner outputs and six reply dates matched an independent recomputation, and two seeded mutations were caught. Worst defect: negation is not handled, so "Do not remove me from your list" triages as an unsubscribe, which suppresses a warm lead. Numeric dates are read month-first without a warning. Reply accuracy on unseen text is 37.5% to 66% by the project's own eval, and nothing has run on a real mailbox.
- **`ventures/mobile-home-park-valuation-calculator`: not at the bar** (claims 2, craft 2, median 2). 22 of 22 tests pass, and NOI, PMT, DSCR and break-even recomputed exactly. Worst defect: a cleared lot-rent or price field silently falls back to a placeholder default. There is no vacancy line, so break-even move-outs are optimistic.
- **`ventures/ca-gst-hst-small-supplier-checker`: not at the bar** (claims 2). 30 of 30 tests pass, six of six outputs matched, three of three mutations caught. The rules were written from memory and never checked against CRA text. The Quick Method 400,000 limit is tested on tax-included sales while the page's FAQ says "before tax". The auditor called the code wrong. I could not confirm which base CRA uses, so it is recorded as an unresolved inconsistency.
- **`research/verified-dse`: not at the bar** (verification 2, claims 2). Tables regenerate and Kendall tau and regret recomputed exactly. The result is honestly negative and workshop-level. Two of four seeded mutations passed all 18 tests, including one in `pick_regret`, the headline metric. The page text in `project.json` still says milestones 1 to 3 are done.
- **`research/selfrep-learnfirst`: not at the bar** (verification 2). `run.py` reproduces `results.txt` byte for byte. One of four mutations survived, and no test asserts a headline number. The "lines" ranking is alphabetical tie-break noise. The result is a sort over placeholder data, with no citation of the closure literature.
- **`platform/counter`: not at the bar** (claims 2). 40 of 40 tests pass and all three mutations were caught. The per-slug daily cap of 20,000 silently stops counting with no flag in the data. The README says "about 200 lines" and keeps GitHub Pages framing.

## What changed since round 15

Nothing is fixed in this round. Defects are in the audit files. The pattern holds: numbers recompute, while claims lag (stale hosts, stale status lines) and tests miss boundary mutations.
